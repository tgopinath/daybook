import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

const KEEP = 10;

/** Remember a search the user acted on. */
export const POST = route(async ({ req, user }) => {
  const { query } = await body(req, z.object({ query: z.string().trim().min(1).max(100) }));
  await db.recentSearch.upsert({
    where: { userId_query: { userId: user.id, query } },
    update: { createdAt: new Date() },
    create: { userId: user.id, query },
  });
  const old = await db.recentSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: KEEP, select: { id: true } });
  if (old.length) await db.recentSearch.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { ok: true };
});

export const DELETE = route(async ({ user }) => {
  await db.recentSearch.deleteMany({ where: { userId: user.id } });
  return { ok: true };
});
