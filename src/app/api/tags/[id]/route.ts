import { z } from "zod";
import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";

const schema = z.object({ name: z.string().trim().min(1).max(40) });

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const { name } = await body(req, schema);
  const t = await db.tag.findFirst({ where: { id: params.id, userId: user.id } });
  if (!t) throw notFound("Tag");
  return { item: await db.tag.update({ where: { id: t.id }, data: { name } }) };
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const t = await db.tag.findFirst({ where: { id: params.id, userId: user.id } });
  if (!t) throw notFound("Tag");
  await db.tag.delete({ where: { id: t.id } });
  return { ok: true };
});
