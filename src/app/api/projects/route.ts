import { z } from "zod";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";

const schema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });

/** GET /api/projects (?all=1 includes archived projects) */
export const GET = route(async ({ req, user }) => {
  const all = query(req).get("all") === "1";
  const items = await db.project.findMany({
    where: { userId: user.id, ...(all ? {} : { archived: false }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: { where: { deletedAt: null, archivedAt: null } } } } },
  });
  return { items: items.map(({ _count, ...p }) => ({ ...p, taskCount: _count.tasks })) };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, schema);
  const existing = await db.project.findFirst({ where: { userId: user.id, name: { equals: input.name, mode: "insensitive" } } });
  if (existing) return { item: existing };
  return { item: await db.project.create({ data: { userId: user.id, name: input.name, ...(input.color ? { color: input.color } : {}) } }) };
});
