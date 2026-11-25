import { db } from "@/lib/db";
import { ApiError, query, route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey } from "@/lib/time";
import { addMonths, budgetProgress, eachDay, monthOf, monthRange, summarize, totalsOf } from "@/lib/finance";
import { accountsWithBalances, isDayKeyOr, userCurrency, userWeekStart } from "../_lib";
import { expensesByCategory } from "../budgets/_shared";

const SELECT = { type: true, amount: true, date: true, category: true, accountId: true, toAccountId: true, paymentMethod: true } as const;

/** Everything the Finance overview needs for a date range, in one round trip. */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const today = dayKey(new Date(), tzOf(req));
  const cur = monthRange(monthOf(today));
  const from = isDayKeyOr(sp.get("from"), cur.from);
  const to = isDayKeyOr(sp.get("to"), cur.to);
  if (from > to) throw new ApiError(400, "from must be on or before to");
  const days = eachDay(from, to, 5000).length;
  if (days > 3700) throw new ApiError(400, "Pick a range of up to 10 years");

  // Compare with the previous calendar month/year when the range is exactly one; otherwise the same number of days before.
  const wholeMonth = from === monthRange(monthOf(from)).from && to === monthRange(monthOf(from)).to;
  const wholeYear = from.endsWith("-01-01") && to === `${from.slice(0, 4)}-12-31`;
  const prev = wholeMonth
    ? monthRange(addMonths(monthOf(from), -1))
    : wholeYear
      ? { from: `${Number(from.slice(0, 4)) - 1}-01-01`, to: `${Number(from.slice(0, 4)) - 1}-12-31` }
      : { from: addDaysKey(from, -days), to: addDaysKey(from, -1) };
  const prevFrom = prev.from;
  const prevTo = prev.to;
  const trendEnd = monthOf(to < today ? to : today);
  const trendStart = addMonths(trendEnd, -5);

  const [currency, weekStart, rows, prevRows, trendRows, accounts, budgets] = await Promise.all([
    userCurrency(user.id),
    userWeekStart(user.id),
    db.transaction.findMany({ where: { userId: user.id, deletedAt: null, date: { gte: from, lte: to } }, select: SELECT }),
    db.transaction.findMany({ where: { userId: user.id, deletedAt: null, date: { gte: prevFrom, lte: prevTo }, type: { in: ["income", "expense"] } }, select: { type: true, amount: true } }),
    db.transaction.findMany({
      where: { userId: user.id, deletedAt: null, type: { in: ["income", "expense"] }, date: { gte: `${trendStart}-01`, lte: monthRange(trendEnd).to } },
      select: SELECT,
    }),
    accountsWithBalances(user.id),
    db.budget.findMany({ where: { userId: user.id } }),
  ]);

  const budgetMonth = trendEnd;
  const spentByCat = await expensesByCategory(user.id, budgetMonth);
  const expenses = rows.filter((r) => r.type === "expense");

  return {
    from,
    to,
    today,
    currency,
    weekStart,
    totals: totalsOf(rows),
    previous: { from: prevFrom, to: prevTo, ...totalsOf(prevRows) },
    byCategory: summarize(expenses, "category").map((g) => ({ key: g.key, amount: g.expense, count: g.count })),
    byMethod: summarize(expenses, "method").map((g) => ({ key: g.key, amount: g.expense, count: g.count })),
    daily: days <= 92 ? summarize(rows, "day", { from, to }).map((g) => ({ key: g.key, income: g.income, expense: g.expense })) : [],
    weekly: summarize(rows, "week", { weekStart, from, to }).map((g) => ({ key: g.key, income: g.income, expense: g.expense })),
    trend: summarize(trendRows, "month", { from: `${trendStart}-01`, to: monthRange(trendEnd).to }).map((g) => ({ key: g.key, income: g.income, expense: g.expense, net: g.net })),
    accounts,
    budgetMonth,
    budgets: budgetProgress(
      budgets.map(({ userId: _u, ...b }) => b),
      budgetMonth,
      spentByCat,
    ),
  };
});
