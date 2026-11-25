import { db } from "@/lib/db";
import { ApiError, body, notFound, route } from "@/lib/api";
import { budgetSchema } from "../_shared";

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, budgetSchema.partial());
  const row = await db.budget.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) throw notFound("Budget");
  const category = input.category ?? row.category;
  const month = input.month ?? row.month;
  if (category !== row.category || month !== row.month) {
    const clash = await db.budget.findFirst({ where: { userId: user.id, category, month, NOT: { id: row.id } }, select: { id: true } });
    if (clash) throw new ApiError(409, "There's already a budget for that category and month");
  }
  const updated = await db.budget.update({ where: { id: row.id }, data: { category, month, ...(input.limit !== undefined ? { limit: input.limit } : {}) } });
  const { userId: _u, ...item } = updated;
  return { item };
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const res = await db.budget.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!res.count) throw notFound("Budget");
  return { ok: true };
});
