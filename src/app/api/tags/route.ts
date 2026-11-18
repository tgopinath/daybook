import { z } from "zod";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";

const schema = z.object({ name: z.string().trim().min(1).max(40) });

/** GET /api/tags?q= */
export const GET = route(async ({ req, user }) => {
  const q = query(req).get("q")?.trim();
  const items = await db.tag.findMany({
    where: { userId: user.id, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true, notes: true } } },
  });
  return { items: items.map(({ _count, ...t }) => ({ ...t, taskCount: _count.tasks, noteCount: _count.notes })) };
});

export const POST = route(async ({ req, user }) => {
  const { name } = await body(req, schema);
  const existing = await db.tag.findFirst({ where: { userId: user.id, name: { equals: name, mode: "insensitive" } } });
  if (existing) return { item: existing };
  return { item: await db.tag.create({ data: { userId: user.id, name } }) };
});
