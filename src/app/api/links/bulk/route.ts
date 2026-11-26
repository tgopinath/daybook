import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { linkInput } from "../_shared";

/** Adds several app links at once (up to 50), after the existing ones, skipping links already saved. */
export const POST = route(async ({ req, user }) => {
  const { items } = await body(req, z.object({ items: z.array(linkInput).min(1, "Add at least one app").max(50, "Add up to 50 apps at a time") }));
  const existing = new Set((await db.appLink.findMany({ where: { userId: user.id }, select: { url: true } })).map((l) => l.url.replace(/\/+$/, "")));
  const last = await db.appLink.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let order = last?.sortOrder ?? 0;
  const fresh = items.filter((i) => {
    const key = i.url.replace(/\/+$/, "");
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (fresh.length) {
    await db.appLink.createMany({
      data: fresh.map((i) => ({ userId: user.id, name: i.name, url: i.url, description: i.description || null, emoji: i.emoji || null, sortOrder: ++order })),
    });
  }
  return { added: fresh.length, skipped: items.length - fresh.length };
});
