import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, query, route } from "@/lib/api";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: color.optional(),
  kind: z.enum(["general", "task", "goal", "event", "note", "vault"]).optional(),
});

/** GET /api/categories?kind=task → categories of that kind plus "general" ones. */
export const GET = route(async ({ req, user }) => {
  const kind = query(req).get("kind");
  const items = await db.category.findMany({
    where: { userId: user.id, ...(kind ? { kind: { in: [kind, "general"] } } : {}) },
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { tasks: { where: { deletedAt: null, archivedAt: null } } } } },
  });
  return { items: items.map(({ _count, ...c }) => ({ ...c, taskCount: _count.tasks })) };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, categorySchema);
  const kind = input.kind ?? "general";
  const existing = await db.category.findFirst({ where: { userId: user.id, kind, name: { equals: input.name, mode: "insensitive" } } });
  if (existing) return { item: existing };
  try {
    const item = await db.category.create({ data: { userId: user.id, name: input.name, kind, ...(input.color ? { color: input.color } : {}) } });
    return { item };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ApiError(409, "A category with that name exists");
    throw e;
  }
});
