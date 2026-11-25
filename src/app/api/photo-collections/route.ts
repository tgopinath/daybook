import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { collectionInclude, serializeCollection } from "./_lib";

export const GET = route(async ({ user }) => {
  const rows = await db.photoCollection.findMany({ where: { userId: user.id }, include: collectionInclude, orderBy: { title: "asc" } });
  return { items: rows.map(serializeCollection) };
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Name the collection").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  const c = await db.photoCollection.create({ data: { userId: user.id, title: input.title, description: input.description || null }, include: collectionInclude });
  return { item: serializeCollection(c) };
});
