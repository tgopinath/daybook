import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ALL_CATEGORIES, EVERY_MONTH, TRANSFER_CATEGORY, budgetProgress, monthRange } from "@/lib/finance";
import { amountSchema } from "../_lib";

export const monthSchema = z.string().refine((m) => m === EVERY_MONTH || /^\d{4}-(0[1-9]|1[0-2])$/.test(m), "Use a month like 2026-11, or * for every month");
export const budgetCategory = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((c) => c !== TRANSFER_CATEGORY, "Transfers can't have a budget");

export const budgetSchema = z.object({ category: budgetCategory.default(ALL_CATEGORIES), month: monthSchema.default(EVERY_MONTH), limit: amountSchema });
export type BudgetInput = z.output<typeof budgetSchema>;

export async function expensesByCategory(userId: string, month: string) {
  const { from, to } = monthRange(month);
  const g = await db.transaction.groupBy({ by: ["category"], where: { userId, deletedAt: null, type: "expense", date: { gte: from, lte: to } }, _sum: { amount: true } });
  return new Map(g.map((r) => [r.category, r._sum.amount ?? 0]));
}

export async function progressFor(userId: string, month: string) {
  const budgets = await db.budget.findMany({ where: { userId }, orderBy: [{ category: "asc" }, { month: "asc" }] });
  const spent = await expensesByCategory(userId, month);
  const items = budgets.map(({ userId: _u, ...b }) => b);
  return { items, progress: budgetProgress(items, month, spent) };
}
