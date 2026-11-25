import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { totalsOf } from "@/lib/finance";
import { assertAccounts, assertReceipt, readFilter, serializeTx, shapeTransfer, txCreateSchema, whereOf } from "../_lib";

const SORTS: Record<string, Prisma.TransactionOrderByWithRelationInput[]> = {
  date_desc: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  date_asc: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  amount_desc: [{ amount: "desc" }, { date: "desc" }, { id: "desc" }],
  amount_asc: [{ amount: "asc" }, { date: "desc" }, { id: "desc" }],
};

/**
 * List with filters (from, to, type, category, account, method, min, max, q), sort and cursor
 * pagination. Soft-delete contract: `?scope=trash` lists deleted rows; `?scope=archived` → [].
 * Also returns totals for the whole filtered set and income/expense totals for each day on the page.
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  if (sp.get("scope") === "archived") return { items: [], nextCursor: null, totals: totalsOf([]), dayTotals: {} };
  const f = readFilter(sp);
  const where = whereOf(user.id, f);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const sort = f.scope === "trash" ? [{ deletedAt: "desc" as const }, { id: "desc" as const }] : SORTS[sp.get("sort") ?? "date_desc"] ?? SORTS.date_desc!;
  const cursor = sp.get("cursor");

  const rows = await db.transaction.findMany({
    where,
    orderBy: sort,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { receipt: true },
  });
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1]!.id : null;

  // Totals across the whole filtered set (all pages) — used by the sheet footer and list header.
  const sums = await db.transaction.groupBy({ by: ["type"], where, _sum: { amount: true }, _count: { _all: true } });
  const totals = { income: 0, expense: 0, transfer: 0, net: 0, count: 0 };
  for (const s of sums) {
    totals.count += s._count._all;
    if (s.type === "income" || s.type === "expense" || s.type === "transfer") totals[s.type] += s._sum.amount ?? 0;
  }
  totals.net = totals.income - totals.expense;

  // Day totals for the days shown (complete even when a day spans pages).
  const days = [...new Set(page.map((t) => t.date))];
  const dayTotals: Record<string, { income: number; expense: number; count: number }> = {};
  if (days.length && f.scope === "active") {
    const g = await db.transaction.groupBy({ by: ["date", "type"], where: { ...where, date: { in: days } }, _sum: { amount: true }, _count: { _all: true } });
    for (const r of g) {
      const d = (dayTotals[r.date] ??= { income: 0, expense: 0, count: 0 });
      d.count += r._count._all;
      if (r.type === "income") d.income += r._sum.amount ?? 0;
      if (r.type === "expense") d.expense += r._sum.amount ?? 0;
    }
  }
  return { items: page.map(serializeTx), nextCursor, totals, dayTotals };
});

export const POST = route(async ({ req, user }) => {
  const input = shapeTransfer(await body(req, txCreateSchema));
  await assertAccounts(user.id, [input.accountId, input.toAccountId]);
  await assertReceipt(user.id, input.receiptMediaId);
  const row = await db.transaction.create({
    data: {
      userId: user.id,
      type: input.type,
      amount: input.amount,
      date: input.date ?? dayKey(new Date(), tzOf(req)),
      category: input.category ?? "Other",
      accountId: input.accountId ?? null,
      toAccountId: input.toAccountId ?? null,
      paymentMethod: input.type === "transfer" ? null : input.paymentMethod ?? null,
      payee: input.payee ?? null,
      note: input.note ?? null,
      tags: input.tags ?? [],
      receiptMediaId: input.receiptMediaId ?? null,
    },
    include: { receipt: true },
  });
  return { item: serializeTx(row) };
});
