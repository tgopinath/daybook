import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";
import { assertOwnMedia, bucketFields, DAY_RE, dayToDate, serializeBucket } from "./_lib";


/**
 * GET /api/bucket-list — live items (not archived, not deleted).
 * ?scope=archived → archived only; ?scope=trash → deleted only.
 */
export const GET = route(async ({ req, user }) => {
  const scope = query(req).get("scope");
  const where: Prisma.BucketItemWhereInput =
    scope === "trash"
      ? { userId: user.id, deletedAt: { not: null } }
      : scope === "archived"
        ? { userId: user.id, deletedAt: null, archivedAt: { not: null } }
        : { userId: user.id, deletedAt: null, archivedAt: null };
  const rows = await db.bucketItem.findMany({
    where,
    include: { image: true },
    orderBy: scope === "trash" ? [{ deletedAt: "desc" }] : scope === "archived" ? [{ archivedAt: "desc" }] : [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
  return { items: rows.map(serializeBucket) };
});

const createSchema = z.object({ ...bucketFields, completed: z.boolean().optional(), completedOn: z.string().regex(DAY_RE).optional() });

export const POST = route(async ({ req, user }) => {
  const { targetDate, imageMediaId, completed, completedOn, ...input } = await body(req, createSchema);
  if (imageMediaId) await assertOwnMedia(user.id, [imageMediaId]);
  const first = await db.bucketItem.findFirst({ where: { userId: user.id, deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { sortOrder: true } });
  const item = await db.bucketItem.create({
    data: {
      ...input,
      userId: user.id,
      targetDate: dayToDate(targetDate) ?? null,
      imageMediaId: imageMediaId ?? null,
      completedAt: completed ? (completedOn ? dayToDate(completedOn)! : new Date()) : null,
      sortOrder: (first?.sortOrder ?? 1) - 1,
    },
    include: { image: true },
  });
  return { item: serializeBucket(item) };
});
