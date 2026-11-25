import { db } from "@/lib/db";
import { ApiError, query, route } from "@/lib/api";
import { toCsv } from "@/lib/finance";
import { readFilter, userCurrency, whereOf } from "../_lib";

/** `GET /api/finance/export.csv?from&to` (+ list filters) → CSV download. */
export const GET = route(async ({ req, user }) => {
  const f = readFilter(query(req));
  f.scope = "active";
  const rows = await db.transaction.findMany({
    where: whereOf(user.id, f),
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 50_001,
    select: { date: true, type: true, category: true, payee: true, accountId: true, toAccountId: true, paymentMethod: true, amount: true, note: true, tags: true },
  });
  if (rows.length > 50_000) throw new ApiError(413, "That's more than 50,000 transactions — export a shorter date range");
  const [currency, accounts] = await Promise.all([
    userCurrency(user.id),
    db.financeAccount.findMany({ where: { userId: user.id }, select: { id: true, name: true } }),
  ]);
  const csv = toCsv(rows, new Map(accounts.map((a) => [a.id, a.name])), currency);
  const name = `mydiary-transactions${f.from ? `-${f.from}` : ""}${f.to ? `-to-${f.to}` : ""}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
});
