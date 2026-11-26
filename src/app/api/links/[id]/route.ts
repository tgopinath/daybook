import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";
import { linkPatch } from "../_shared";

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, linkPatch);
  const found = await db.appLink.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!found) throw notFound("Link");
  const item = await db.appLink.update({
    where: { id: found.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.emoji !== undefined ? { emoji: input.emoji || null } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
      ...(input.url !== undefined && input.imageUrl === undefined ? { imageUrl: null } : {}),
    },
  });
  return { item };
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const { count } = await db.appLink.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!count) throw notFound("Link");
  return { ok: true };
});
