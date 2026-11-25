import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";
import { collectionInclude, serializeCollection } from "../_lib";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const c = await db.photoCollection.findFirst({ where: { id: params.id, userId: user.id }, include: collectionInclude });
  if (!c) throw notFound("Collection");
  return { item: serializeCollection(c) };
});

const patchSchema = z.object({
  title: z.string().trim().min(1, "Name the collection").max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const existing = await db.photoCollection.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Collection");
  const data: Prisma.PhotoCollectionUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  const c = await db.photoCollection.update({ where: { id: existing.id }, data, include: collectionInclude });
  return { item: serializeCollection(c) };
});

/** Deletes the collection; its photos stay in the diary. */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const existing = await db.photoCollection.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Collection");
  await db.$transaction([
    db.photoEntry.updateMany({ where: { collectionId: existing.id, userId: user.id }, data: { collectionId: null } }),
    db.photoCollection.delete({ where: { id: existing.id } }),
  ]);
  return { ok: true };
});
