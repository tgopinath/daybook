import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body } from "@/lib/api";
import { isDayKey } from "@/lib/finance";
import { userCurrency } from "@/app/api/finance/_lib";
import { buildWorkbook, createSpreadsheet } from "../_sheets";
import { assertSheetsAvailable, requireDriveToken, sheetsRoute } from "../_lib";

export const maxDuration = 60;

const schema = z
  .object({
    from: z.string().refine(isDayKey, "from: use a date like 2026-11-01").optional(),
    to: z.string().refine(isDayKey, "to: use a date like 2026-11-30").optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, "from must be on or before to");

/**
 * `POST /api/google-drive/sheets/export { from, to }` → creates a new spreadsheet in the user's Drive
 * and returns its URL. Missing/expired Google access → 401 { reconnect: true }.
 */
export const POST = sheetsRoute(async ({ req, user }) => {
  assertSheetsAvailable(user);
  const range = await body(req, schema);
  const token = await requireDriveToken(user.id);
  const rows = await db.transaction.findMany({
    where: { userId: user.id, deletedAt: null, ...(range.from || range.to ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 20_001,
    select: { date: true, type: true, category: true, payee: true, accountId: true, toAccountId: true, paymentMethod: true, amount: true, note: true, tags: true },
  });
  if (rows.length > 20_000) throw new ApiError(413, "That's more than 20,000 transactions — export a shorter date range");
  const [currency, accounts] = await Promise.all([userCurrency(user.id), db.financeAccount.findMany({ where: { userId: user.id }, select: { id: true, name: true } })]);
  const wb = buildWorkbook(rows, new Map(accounts.map((a) => [a.id, a.name])), currency, range);
  const sheet = await createSpreadsheet(token, wb);
  return { url: sheet.url, id: sheet.id, title: wb.title, rows: wb.rowCount };
});
