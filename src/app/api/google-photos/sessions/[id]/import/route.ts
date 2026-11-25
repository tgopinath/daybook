import { z } from "zod";
import type { MediaFile } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, notFound, tzOf } from "@/lib/api";
import { IMPORT_BATCH, downloadItem, listPickedItems, partitionImported, pickerFetch, type PickedItem } from "@/lib/google-photos";
import { MEDIA_RULES, kindOf, newStorageKey } from "@/lib/media";
import { appendMemoryMedia, assertCollection, memoryInclude, serializeMemory } from "@/lib/memories";
import { deleteObjects, writeObject } from "@/lib/storage";
import { dayKey } from "@/lib/time";
import { assertAvailable, gpRoute, requireToken } from "../../../_lib";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  target: z.enum(["photos", "memory"]),
  memoryId: z.string().max(40).optional(),
  memoryTitle: z.string().trim().max(200).optional(),
  collectionId: z.string().max(40).nullable().optional(),
  // Items that failed in an earlier batch; not retried so the loop always finishes.
  skipIds: z.array(z.string().max(300)).max(500).optional(),
});

const TIME_BUDGET_MS = 40_000;

/**
 * Imports the picked items in batches of at most IMPORT_BATCH new downloads per call.
 * The client calls again with the returned `memoryId` (target memory) and `skipIds` until `done`.
 * Items already imported earlier (same Google id) are reused, never downloaded twice.
 */
export const POST = gpRoute<{ id: string }>(async ({ req, user, params }) => {
  assertAvailable(user);
  const input = await body(req, schema);
  const tz = tzOf(req);
  const sessionId = params.id;
  if (!/^[\w.-]{1,200}$/.test(sessionId)) throw new ApiError(400, "Invalid session");
  const token = await requireToken(user.id);

  let memoryId = input.memoryId ?? null;
  if (input.target === "memory" && memoryId) {
    const ok = await db.memory.count({ where: { id: memoryId, userId: user.id } });
    if (!ok) throw notFound("Memory");
  }
  if (input.target === "photos") await assertCollection(user.id, input.collectionId);

  const picked = await listPickedItems(token, sessionId);
  if (!picked.length) throw new ApiError(400, "No photos were picked in Google Photos");
  const already = await db.mediaFile.findMany({
    where: { userId: user.id, source: "google_photos", status: "ready", sourceId: { in: picked.map((p) => p.id) } },
  });
  const { existing, fresh } = partitionImported(picked, already.map((m) => m.sourceId!));
  const skip = new Set(input.skipIds ?? []);
  const todo = fresh.filter((p) => !skip.has(p.id));

  const started = Date.now();
  const created: MediaFile[] = [];
  const failed: { id: string; name: string; error: string }[] = [];
  for (const item of todo.slice(0, IMPORT_BATCH)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      created.push(await importOne(user.id, token, item));
    } catch (err) {
      if (err instanceof Error && "reconnect" in err && (err as { reconnect: boolean }).reconnect) throw err;
      failed.push({ id: item.id, name: item.filename ?? (item.type === "VIDEO" ? "A video" : "A photo"), error: err instanceof Error ? err.message : "Import failed" });
    }
  }

  // Link everything we have so far (reused + new) to the target, in picked order. Idempotent across batches.
  const bySource = new Map<string, MediaFile>([...already, ...created].map((m) => [m.sourceId!, m]));
  const ordered = picked.map((p) => bySource.get(p.id)).filter((m): m is MediaFile => !!m);
  let memory = null;
  let photosAdded = 0;
  if (input.target === "memory") {
    if (!memoryId && ordered.length) {
      const dates = picked.map((p) => p.createTime).filter((d): d is string => !!d).sort();
      const m = await db.memory.create({
        data: { userId: user.id, title: input.memoryTitle || "From Google Photos", date: dates[0] ? new Date(dates[0]) : new Date() },
      });
      memoryId = m.id;
    }
    if (memoryId) {
      await appendMemoryMedia(memoryId, ordered.map((m) => m.id));
      const full = await db.memory.findFirst({ where: { id: memoryId, userId: user.id }, include: memoryInclude });
      memory = full ? serializeMemory(full, tz) : null;
    }
  } else {
    photosAdded = await addToDiary(user.id, ordered, tz, input.collectionId ?? null);
  }

  const remaining = todo.length - created.length - failed.length;
  const done = remaining <= 0;
  if (done) await pickerFetch(token, `/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => {});
  return {
    total: picked.length,
    imported: created.length,
    reused: existing.length,
    failed,
    remaining: Math.max(0, remaining),
    done,
    memoryId,
    memory,
    photosAdded,
  };
});

async function importOne(userId: string, token: string, item: PickedItem): Promise<MediaFile> {
  if (!item.videoReady) throw new Error("Google Photos is still processing this video. Try again later.");
  const kindHint = item.type === "VIDEO" ? "video" : "image";
  const { bytes, mimeType } = await downloadItem(token, item, MEDIA_RULES[kindHint].maxBytes);
  const kind = kindOf(mimeType);
  if (kind !== "image" && kind !== "video") throw new Error(`That file type (${mimeType}) isn't supported`);
  if (bytes.length > MEDIA_RULES[kind].maxBytes) throw new Error(`Larger than ${Math.round(MEDIA_RULES[kind].maxBytes / 1024 / 1024)} MB`);
  const storageKey = newStorageKey(userId, mimeType);
  await writeObject(storageKey, bytes, mimeType);
  // Photos are fetched at most 2560px on the long edge; scale the original dimensions to match.
  let width = item.width;
  let height = item.height;
  if (kind === "image" && width && height) {
    const scale = Math.min(1, 2560 / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  try {
    return await db.mediaFile.create({
      data: {
        userId,
        kind,
        mimeType,
        size: bytes.length,
        width,
        height,
        storageKey,
        originalName: item.filename,
        source: "google_photos",
        sourceId: item.id,
        takenAt: item.createTime ? new Date(item.createTime) : null,
        status: "ready",
      },
    });
  } catch (err) {
    await deleteObjects([storageKey]).catch(() => {});
    throw err;
  }
}

/** Adds files to the Photo Diary unless they're already there; restores trashed entries for them. */
async function addToDiary(userId: string, media: MediaFile[], tz: string, collectionId: string | null) {
  if (!media.length) return 0;
  const entries = await db.photoEntry.findMany({ where: { userId, mediaId: { in: media.map((m) => m.id) } }, select: { id: true, mediaId: true, deletedAt: true } });
  const has = new Set(entries.map((e) => e.mediaId));
  const trashed = entries.filter((e) => e.deletedAt).map((e) => e.id);
  if (trashed.length) await db.photoEntry.updateMany({ where: { id: { in: trashed }, userId }, data: { deletedAt: null } });
  const toAdd = media.filter((m) => !has.has(m.id));
  if (toAdd.length) {
    await db.photoEntry.createMany({
      data: toAdd.map((m) => ({ userId, mediaId: m.id, takenOn: dayKey(m.takenAt ?? new Date(), tz), collectionId })),
    });
  }
  return toAdd.length + trashed.length;
}
