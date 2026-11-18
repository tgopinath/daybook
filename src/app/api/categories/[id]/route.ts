import { z } from "zod";
import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";

const schema = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, schema);
  const c = await db.category.findFirst({ where: { id: params.id, userId: user.id } });
  if (!c) throw notFound("Category");
  return { item: await db.category.update({ where: { id: c.id }, data: input }) };
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const c = await db.category.findFirst({ where: { id: params.id, userId: user.id } });
  if (!c) throw notFound("Category");
  await db.category.delete({ where: { id: c.id } }); // tasks keep existing; categoryId → null
  return { ok: true };
});
