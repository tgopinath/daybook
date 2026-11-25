import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route, tzOf } from "@/lib/api";
import { assertAlbum, assertMediaOwned, memoryDate, memoryInclude, purgeMemories, serializeMemory, setMemoryMedia } from "@/lib/memories";
import { memoryFields } from "../_schema";

export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const m = await db.memory.findFirst({ where: { id: params.id, userId: user.id }, include: memoryInclude });
  if (!m) throw notFound("Memory");
  return { item: serializeMemory(m, tzOf(req)) };
});

const patchSchema = z
  .object(memoryFields)
  .partial()
  .extend({
    // Appends without replacing (e.g. after a Google Photos import or "add photos").
    addMediaIds: z.array(z.string().max(40)).max(200).optional(),
    archived: z.boolean().optional(),
    deletedAt: z.null().optional(),
  });

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const tz = tzOf(req);
  const existing = await db.memory.findFirst({ where: { id: params.id, userId: user.id }, include: { media: { select: { mediaId: true } } } });
  if (!existing) throw notFound("Memory");
  if (input.albumId !== undefined) await assertAlbum(user.id, input.albumId);

  const data: Prisma.MemoryUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.caption !== undefined) data.caption = input.caption || null;
  if (input.date !== undefined) data.date = memoryDate(input.date, tz);
  if (input.location !== undefined) data.location = input.location || null;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.albumId !== undefined) data.albumId = input.albumId || null;
  if (input.favorite !== undefined) data.favorite = input.favorite;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.deletedAt === null) data.deletedAt = null;
  await db.memory.update({ where: { id: existing.id }, data });

  let ids: string[] | null = null;
  if (input.mediaIds) ids = [...new Set(input.mediaIds)];
  if (input.addMediaIds?.length) ids = [...new Set([...(ids ?? existing.media.map((x) => x.mediaId)), ...input.addMediaIds])];
  if (ids) {
    // Only newly linked files need the ownership check; existing links are already the user's.
    const current = new Set(existing.media.map((x) => x.mediaId));
    await assertMediaOwned(user.id, ids.filter((id) => !current.has(id)));
    await setMemoryMedia(existing.id, ids);
  }
  const full = await db.memory.findFirstOrThrow({ where: { id: existing.id, userId: user.id }, include: memoryInclude });
  return { item: serializeMemory(full, tz) };
});

/** Soft delete (Trash); `?permanent=1` deletes for good, along with files only this memory used. */
export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const permanent = query(req).get("permanent") === "1";
  if (permanent) {
    const n = await purgeMemories(user.id, [params.id]);
    if (!n) throw notFound("Memory");
    return { ok: true };
  }
  const res = await db.memory.updateMany({ where: { id: params.id, userId: user.id }, data: { deletedAt: new Date() } });
  if (!res.count) throw notFound("Memory");
  return { ok: true };
});
