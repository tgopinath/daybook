import { db } from "@/lib/db";
import { ApiError, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { GROUP_BYS, PAYMENT_METHOD_LABEL, monthRange, summarize, totalsOf, type GroupBy, type PaymentMethod } from "@/lib/finance";
import { readFilter, userCurrency, userWeekStart, whereOf } from "../_lib";

/**
 * Totals grouped by day | week | month | category | account | method.
 * `GET /api/finance/summary?from=2026-11-01&to=2026-11-30&groupBy=week` (weeks follow the user's weekStart).
 * Accepts the same filters as the transaction list. Transfers never count as income or expense.
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const groupBy = (sp.get("groupBy") ?? "day") as GroupBy;
  if (!GROUP_BYS.includes(groupBy)) throw new ApiError(400, `groupBy must be one of ${GROUP_BYS.join(", ")}`);
  const f = readFilter(sp);
  f.scope = "active";
  const month = monthRange(dayKey(new Date(), tzOf(req)).slice(0, 7));
  const from = f.from ?? month.from;
  const to = f.to ?? month.to;
  if (from > to) throw new ApiError(400, "from must be on or before to");
  const [currency, weekStart] = await Promise.all([userCurrency(user.id), userWeekStart(user.id)]);
  const rows = await db.transaction.findMany({
    where: whereOf(user.id, { ...f, from, to }),
    select: { type: true, amount: true, date: true, category: true, accountId: true, toAccountId: true, paymentMethod: true },
  });
  const groups = summarize(rows, groupBy, { weekStart, from, to });
  let labels: Record<string, string> | undefined;
  if (groupBy === "account") {
    const accounts = await db.financeAccount.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
    labels = Object.fromEntries([...accounts.map((a) => [a.id, a.name]), ["none", "No account"]]);
  } else if (groupBy === "method") {
    labels = { ...PAYMENT_METHOD_LABEL, none: "Not set" } as Record<PaymentMethod | "none", string>;
  }
  return {
    from,
    to,
    groupBy,
    weekStart,
    currency,
    totals: totalsOf(rows),
    groups: groups.map((g) => ({ ...g, label: labels?.[g.key] ?? g.key })),
  };
});
