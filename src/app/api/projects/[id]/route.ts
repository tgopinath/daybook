import { z } from "zod";
import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, schema);
  const p = await db.project.findFirst({ where: { id: params.id, userId: user.id } });
  if (!p) throw notFound("Project");
  return { item: await db.project.update({ where: { id: p.id }, data: input }) };
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const p = await db.project.findFirst({ where: { id: params.id, userId: user.id } });
  if (!p) throw notFound("Project");
  await db.project.delete({ where: { id: p.id } });
  return { ok: true };
});
