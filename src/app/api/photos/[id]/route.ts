import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { DAY_RE, assertCollection, normalizeTags, purgePhotos, serializePhoto } from "@/lib/memories";

const include = { media: true, collection: { select: { id: true, title: true } } } satisfies Prisma.PhotoEntryInclude;

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const p = await db.photoEntry.findFirst({ where: { id: params.id, userId: user.id }, include });
  if (!p) throw notFound("Photo");
  return { item: serializePhoto(p) };
});

const patchSchema = z.object({
  caption: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  takenOn: z.string().regex(DAY_RE, "takenOn must be yyyy-MM-dd").optional(),
  collectionId: z.string().max(40).nullable().optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(), // accepted for the shared contract; photos have no archive
  deletedAt: z.null().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const existing = await db.photoEntry.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Photo");
  if (input.collectionId !== undefined) await assertCollection(user.id, input.collectionId);
  const data: Prisma.PhotoEntryUncheckedUpdateInput = {};
  if (input.caption !== undefined) data.caption = input.caption || null;
  if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
  if (input.takenOn !== undefined) data.takenOn = input.takenOn;
  if (input.collectionId !== undefined) data.collectionId = input.collectionId || null;
  if (input.favorite !== undefined) data.favorite = input.favorite;
  if (input.deletedAt === null) data.deletedAt = null;
  const p = await db.photoEntry.update({ where: { id: existing.id }, data, include });
  return { item: serializePhoto(p) };
});

/** Soft delete; `?permanent=1` also removes the stored file when nothing else uses it. */
export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  if (query(req).get("permanent") === "1") {
    const n = await purgePhotos(user.id, [params.id]);
    if (!n) throw notFound("Photo");
    return { ok: true };
  }
  const res = await db.photoEntry.updateMany({ where: { id: params.id, userId: user.id }, data: { deletedAt: new Date() } });
  if (!res.count) throw notFound("Photo");
  return { ok: true };
});
