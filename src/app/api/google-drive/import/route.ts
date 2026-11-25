import { z } from "zod";
import { db } from "@/lib/db";
import { body } from "@/lib/api";
import { DRIVE_IMPORT_BATCH, GoogleDriveError, downloadPlanned, getFileMeta, partitionDriveIds, planDownload } from "@/lib/google-drive";
import { MEDIA_RULES, kindOf, newStorageKey } from "@/lib/media";
import { deleteObjects, writeObject } from "@/lib/storage";
import { assertFolder } from "../../drive/_lib";
import { assertImportAvailable, gdRoute, requireDriveToken } from "../_lib";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  fileIds: z.array(z.string().max(200)).min(1).max(200),
  folderId: z.string().max(40).nullable().optional(),
  // Files that failed in an earlier batch; not retried so the client loop always finishes.
  skipIds: z.array(z.string().max(200)).max(200).optional(),
});

const TIME_BUDGET_MS = 40_000;

const maxBytesFor = (mimeType: string) => {
  const kind = kindOf(mimeType);
  return kind ? MEDIA_RULES[kind].maxBytes : null;
};

/**
 * Imports files picked in the Google Picker into My Storage, at most DRIVE_IMPORT_BATCH new downloads
 * (or ~40 s) per call. The client calls again with `skipIds` (failed ids) until `done`.
 * Files already imported (same Google file id) are skipped; a trashed copy is restored instead.
 */
export const POST = gdRoute(async ({ req, user }) => {
  assertImportAvailable(user);
  const input = await body(req, schema);
  const folderId = input.folderId || null;
  await assertFolder(user.id, folderId);
  const token = await requireDriveToken(user.id);

  const candidates = partitionDriveIds(input.fileIds, []).unique;
  const already = await db.driveFile.findMany({
    where: { userId: user.id, source: "google_drive", sourceId: { in: candidates } },
    select: { id: true, sourceId: true, deletedAt: true },
  });
  const { unique, existing, fresh } = partitionDriveIds(input.fileIds, already.map((d) => d.sourceId!), input.skipIds ?? []);
  // A copy in the trash counts as imported: bring it back.
  const trashed = already.filter((d) => d.deletedAt).map((d) => d.id);
  if (trashed.length) await db.driveFile.updateMany({ where: { userId: user.id, id: { in: trashed } }, data: { deletedAt: null } });

  const started = Date.now();
  const imported: { id: string; name: string }[] = [];
  const failed: { id: string; name: string; error: string }[] = [];
  for (const id of fresh.slice(0, DRIVE_IMPORT_BATCH)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      imported.push(await importOne(user.id, token, id, folderId));
    } catch (err) {
      if (err instanceof GoogleDriveError && err.reconnect) throw err;
      failed.push({ id, name: (err as { fileName?: string }).fileName ?? "A file", error: err instanceof Error ? err.message : "Import failed" });
    }
  }

  const remaining = Math.max(0, fresh.length - imported.length - failed.length);
  return {
    total: unique.length,
    imported: imported.length,
    files: imported,
    skipped: existing.length,
    restored: trashed.length,
    failed,
    remaining,
    done: remaining === 0,
  };
});

async function importOne(userId: string, token: string, driveId: string, folderId: string | null) {
  let name = "A file";
  try {
    const meta = await getFileMeta(token, driveId);
    name = meta.name;
    // Reuse a stored copy from an earlier import (e.g. the Drive entry was deleted but the file is still used elsewhere).
    let media = await db.mediaFile.findFirst({ where: { userId, source: "google_drive", sourceId: driveId, status: "ready" } });
    let plannedName = meta.name;
    if (!media) {
      const plan = planDownload(meta, maxBytesFor);
      plannedName = plan.name;
      const bytes = await downloadPlanned(token, plan);
      const kind = kindOf(plan.mimeType);
      if (!kind) throw new GoogleDriveError(415, `${meta.name}: that file type isn't supported`);
      const storageKey = newStorageKey(userId, plan.mimeType);
      await writeObject(storageKey, bytes, plan.mimeType);
      try {
        media = await db.mediaFile.create({
          data: { userId, kind, mimeType: plan.mimeType, size: bytes.length, storageKey, originalName: plan.name, source: "google_drive", sourceId: driveId, status: "ready" },
        });
      } catch (err) {
        await deleteObjects([storageKey]).catch(() => {});
        throw err;
      }
    }
    const file = await db.driveFile.create({
      data: { userId, mediaId: media.id, folderId, name: media.originalName ?? plannedName, source: "google_drive", sourceId: driveId },
    });
    return { id: file.id, name: file.name };
  } catch (err) {
    if (err && typeof err === "object") Object.assign(err, { fileName: name });
    throw err;
  }
}
