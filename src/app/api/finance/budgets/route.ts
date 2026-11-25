import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { budgetSchema, progressFor, type BudgetInput } from "./_shared";

/** All budgets plus progress for `?month=yyyy-MM` (default: this month in the user's timezone). */
export const GET = route(async ({ req, user }) => {
  const m = query(req).get("month");
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : dayKey(new Date(), tzOf(req)).slice(0, 7);
  return { month, ...(await progressFor(user.id, month)) };
});

/** Creates or replaces the budget for (category, month). */
export const POST = route(async ({ req, user }) => {
  const input: BudgetInput = budgetSchema.parse(await body(req, z.unknown()));
  const n = await db.budget.count({ where: { userId: user.id } });
  if (n >= 200) throw new ApiError(400, "You can have up to 200 budgets");
  const row = await db.budget.upsert({
    where: { userId_category_month: { userId: user.id, category: input.category, month: input.month } },
    update: { limit: input.limit },
    create: { userId: user.id, ...input },
  });
  const { userId: _u, ...item } = row;
  return { item };
});
