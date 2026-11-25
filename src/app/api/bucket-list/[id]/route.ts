import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { assertOwnMedia, bucketFields, dayToDate, deleteUnusedMedia, findBucket, serializeBucket } from "../_lib";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => {
  const item = await db.bucketItem.findFirst({ where: { id: params.id, userId: user.id }, include: { image: true } });
  if (!item) throw notFound("Bucket list item");
  return { item: serializeBucket(item) };
});

const patchSchema = z
  .object({
    ...bucketFields,
    title: bucketFields.title.optional(),
    completed: z.boolean().optional(),
    /** Optional explicit completion day (yyyy-MM-dd) when marking done. */
    completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    archived: z.boolean().optional(),
    deletedAt: z.null().optional(),
  })
  .strict();

export const PATCH = route<P>(async ({ req, user, params }) => {
  const existing = await findBucket(user.id, params.id);
  const { targetDate, imageMediaId, completed, completedOn, archived, deletedAt, ...input } = await body(req, patchSchema);
  const data: Prisma.BucketItemUncheckedUpdateInput = { ...input };
  if (targetDate !== undefined) data.targetDate = dayToDate(targetDate);
  if (imageMediaId !== undefined) {
    if (imageMediaId) await assertOwnMedia(user.id, [imageMediaId]);
    data.imageMediaId = imageMediaId;
  }
  if (completed !== undefined) data.completedAt = completed ? (completedOn ? dayToDate(completedOn) : (existing.completedAt ?? new Date())) : null;
  else if (completedOn && existing.completedAt) data.completedAt = dayToDate(completedOn);
  if (archived !== undefined) data.archivedAt = archived ? new Date() : null;
  if (deletedAt === null) data.deletedAt = null;
  const item = await db.bucketItem.update({ where: { id: existing.id }, data, include: { image: true } });
  return { item: serializeBucket(item) };
});

/** Soft delete; ?permanent=1 deletes the row and its photo when nothing else uses it. */
export const DELETE = route<P>(async ({ req, user, params }) => {
  const item = await findBucket(user.id, params.id);
  if (query(req).get("permanent") === "1") {
    await db.bucketItem.delete({ where: { id: item.id } });
    if (item.imageMediaId) await deleteUnusedMedia(user.id, [item.imageMediaId]);
    return { ok: true, permanent: true };
  }
  await db.bucketItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
  return { ok: true };
});
