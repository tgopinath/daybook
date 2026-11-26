import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { linkInput } from "./_shared";

/** The user's app links, in their chosen order. */
export const GET = route(async ({ user }) => {
  const items = await db.appLink.findMany({ where: { userId: user.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return { items };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, linkInput);
  const last = await db.appLink.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const item = await db.appLink.create({
    data: { userId: user.id, name: input.name, url: input.url, description: input.description || null, emoji: input.emoji || null, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  return { item };
});
