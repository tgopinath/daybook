import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { linkInput } from "../_shared";

/** Adds several app links at once (up to 50), after the existing ones, skipping links already saved. */
export const POST = route(async ({ req, user }) => {
  const { items } = await body(req, z.object({ items: z.array(linkInput).min(1, "Add at least one app").max(50, "Add up to 50 apps at a time") }));
  const saved = await db.appLink.findMany({ where: { userId: user.id }, select: { id: true, url: true, imageUrl: true } });
  const existing = new Set(saved.map((l) => l.url.replace(/\/+$/, "")));
  // Already-saved apps still pick up a screenshot from the import when they only have an icon (or nothing).
  const iconish = (u: string | null) => !u || /icon|favicon|logo|\.svg(\?|$)/i.test(u);
  const upgrades = items.flatMap((i) => {
    const hit = i.imageUrl ? saved.find((l) => l.url.replace(/\/+$/, "") === i.url.replace(/\/+$/, "")) : undefined;
    return hit && iconish(hit.imageUrl) && !iconish(i.imageUrl!) ? [db.appLink.update({ where: { id: hit.id }, data: { imageUrl: i.imageUrl } })] : [];
  });
  if (upgrades.length) await db.$transaction(upgrades);
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
      data: fresh.map((i) => ({ userId: user.id, name: i.name, url: i.url, description: i.description || null, emoji: i.emoji || null, imageUrl: i.imageUrl || null, sortOrder: ++order })),
    });
  }
  return { added: fresh.length, skipped: items.length - fresh.length };
});
