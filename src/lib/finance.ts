// My Finance: domain constants and pure math shared by the API and the UI.
// Nothing here touches the database, so it is unit-tested directly.
import { addDaysKey, weekdayOfKey } from "./time";
import { toMajor, toPlainString } from "./money";

export const TX_TYPES = ["expense", "income", "transfer"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const ACCOUNT_TYPES = ["cash", "bank", "card", "wallet", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { cash: "Cash", bank: "Bank account", card: "Card", wallet: "Wallet", savings: "Savings" };

export const PAYMENT_METHODS = ["cash", "upi", "card", "netbanking", "wallet", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", other: "Other" };

export type CategoryKind = "expense" | "income" | "both";
/** Curated categories. `icon` is a lucide icon name resolved in the UI. */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; icon: string }[] = [
  { name: "Food & dining", kind: "expense", icon: "utensils" },
  { name: "Groceries", kind: "expense", icon: "shopping-basket" },
  { name: "Transport", kind: "expense", icon: "bus" },
  { name: "Fuel", kind: "expense", icon: "fuel" },
  { name: "Shopping", kind: "expense", icon: "shopping-bag" },
  { name: "Bills & utilities", kind: "expense", icon: "receipt" },
  { name: "Rent", kind: "expense", icon: "home" },
  { name: "Health", kind: "expense", icon: "heart-pulse" },
  { name: "Education", kind: "expense", icon: "graduation-cap" },
  { name: "Entertainment", kind: "expense", icon: "clapperboard" },
  { name: "Travel", kind: "expense", icon: "plane" },
  { name: "Gifts", kind: "both", icon: "gift" },
  { name: "Personal care", kind: "expense", icon: "sparkles" },
  { name: "Subscriptions", kind: "expense", icon: "repeat" },
  { name: "Salary", kind: "income", icon: "briefcase" },
  { name: "Business", kind: "income", icon: "store" },
  { name: "Investments", kind: "both", icon: "trending-up" },
  { name: "Refund", kind: "income", icon: "undo-2" },
  { name: "Other", kind: "both", icon: "circle-ellipsis" },
];
export const TRANSFER_CATEGORY = "Transfer";
export const ALL_CATEGORIES = "*";
export const EVERY_MONTH = "*";

export function categoriesFor(type: TxType): string[] {
  if (type === "transfer") return [TRANSFER_CATEGORY];
  return DEFAULT_CATEGORIES.filter((c) => c.kind === "both" || c.kind === type).map((c) => c.name);
}

/** Normalises tags: trimmed, lower-case, no leading #, unique, at most 20. */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim().replace(/^#+/, "").toLowerCase().slice(0, 30);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}

// ------------------------------------------------------------------ dates

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const monthOf = (day: string) => day.slice(0, 7);

/** First day (yyyy-MM-dd) of the week containing `day`; weekStart 0 = Sunday, 1 = Monday. */
export function weekStartOf(day: string, weekStart: number): string {
  const wd = weekdayOfKey(day);
  return addDaysKey(day, -((wd - weekStart + 7) % 7));
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export type RangePreset = "this_month" | "last_month" | "this_year" | "last_30" | "custom";
export function presetRange(preset: Exclude<RangePreset, "custom">, today: string): { from: string; to: string } {
  const month = monthOf(today);
  if (preset === "this_month") return monthRange(month);
  if (preset === "last_month") return monthRange(addMonths(month, -1));
  if (preset === "last_30") return { from: addDaysKey(today, -29), to: today };
  return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
}

/** Every day key from `from` to `to` inclusive (capped for safety). */
export function eachDay(from: string, to: string, cap = 400): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < cap; d = addDaysKey(d, 1)) out.push(d);
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDay(day: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]}${opts.year ? ` ${y}` : ""}`;
}
export function formatMonth(month: string, short = false): string {
  const [y, m] = month.split("-").map(Number);
  return short ? MONTHS[m! - 1]! : `${MONTHS[m! - 1]} ${y}`;
}
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from, { year: true });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatDay(from, { year: !sameYear })} – ${formatDay(to, { year: true })}`;
}

// ------------------------------------------------------------------ balances

export type AmountRow = { type: string; amount: number; accountId: string | null; toAccountId: string | null };

/**
 * Balance per account = opening + income − expense − transfers out + transfers in.
 * `rows` may be individual transactions or pre-summed groups (same shape).
 */
export function computeBalances<A extends { id: string; openingBalance: number }>(accounts: A[], rows: AmountRow[]): Map<string, number> {
  const bal = new Map<string, number>(accounts.map((a) => [a.id, a.openingBalance]));
  const add = (id: string | null, v: number) => {
    if (id && bal.has(id)) bal.set(id, bal.get(id)! + v);
  };
  for (const r of rows) {
    if (r.type === "income") add(r.accountId, r.amount);
    else if (r.type === "expense") add(r.accountId, -r.amount);
    else if (r.type === "transfer") {
      add(r.accountId, -r.amount);
      add(r.toAccountId, r.amount);
    }
  }
  return bal;
}

// ------------------------------------------------------------------ summaries

export type SummaryTx = AmountRow & { date: string; category: string; paymentMethod: string | null };
export type GroupBy = "day" | "week" | "month" | "category" | "account" | "method";
export const GROUP_BYS: GroupBy[] = ["day", "week", "month", "category", "account", "method"];
export type SummaryGroup = { key: string; income: number; expense: number; transfer: number; net: number; count: number };
export type Totals = { income: number; expense: number; transfer: number; net: number; count: number };

const emptyGroup = (key: string): SummaryGroup => ({ key, income: 0, expense: 0, transfer: 0, net: 0, count: 0 });

export function totalsOf(rows: Pick<AmountRow, "type" | "amount">[]): Totals {
  const t = { income: 0, expense: 0, transfer: 0, net: 0, count: 0 };
  for (const r of rows) {
    t.count++;
    if (r.type === "income") t.income += r.amount;
    else if (r.type === "expense") t.expense += r.amount;
    else if (r.type === "transfer") t.transfer += r.amount;
  }
  t.net = t.income - t.expense;
  return t;
}

/**
 * Groups transactions. Transfers never count as income or expense (they move
 * money between your own accounts); they are reported in `transfer`.
 * Time groupings fill empty periods between `from` and `to` when given.
 */
export function summarize(rows: SummaryTx[], groupBy: GroupBy, opts: { weekStart?: number; from?: string; to?: string } = {}): SummaryGroup[] {
  const weekStart = opts.weekStart ?? 1;
  const keyOf = (r: SummaryTx): string[] => {
    switch (groupBy) {
      case "day":
        return [r.date];
      case "week":
        return [weekStartOf(r.date, weekStart)];
      case "month":
        return [monthOf(r.date)];
      case "category":
        return [r.category || "Other"];
      case "method":
        return [r.paymentMethod || "none"];
      case "account":
        // A transfer touches two accounts.
        return r.type === "transfer" ? [r.accountId ?? "none", r.toAccountId ?? "none"] : [r.accountId ?? "none"];
    }
  };
  const map = new Map<string, SummaryGroup>();
  if (opts.from && opts.to && (groupBy === "day" || groupBy === "week" || groupBy === "month")) {
    for (const d of eachDay(opts.from, opts.to, 4000)) {
      const k = groupBy === "day" ? d : groupBy === "week" ? weekStartOf(d, weekStart) : monthOf(d);
      if (!map.has(k)) map.set(k, emptyGroup(k));
    }
  }
  for (const r of rows) {
    const keys = keyOf(r);
    keys.forEach((k, i) => {
      const g = map.get(k) ?? emptyGroup(k);
      g.count++;
      if (r.type === "income") g.income += r.amount;
      else if (r.type === "expense") g.expense += r.amount;
      else if (r.type === "transfer") {
        g.transfer += r.amount;
        // Per-account view: money left the first account and arrived in the second.
        if (groupBy === "account") g.net += i === 0 ? -r.amount : r.amount;
      }
      map.set(k, g);
    });
  }
  const out = [...map.values()].map((g) => ({ ...g, net: g.net + g.income - g.expense }));
  if (groupBy === "day" || groupBy === "week" || groupBy === "month") out.sort((a, b) => a.key.localeCompare(b.key));
  else out.sort((a, b) => b.expense - a.expense || b.income - a.income || a.key.localeCompare(b.key));
  return out;
}

// ------------------------------------------------------------------ budgets

export type BudgetState = "ok" | "warn" | "over";
/** Under 80% → ok, 80–100% → warn, above the limit → over. */
export function budgetState(spent: number, limit: number): BudgetState {
  if (limit <= 0) return spent > 0 ? "over" : "ok";
  if (spent > limit) return "over";
  if (spent >= limit * 0.8) return "warn";
  return "ok";
}

export type BudgetRow = { id: string; category: string; month: string; limit: number };
/** Budgets that apply to `month`: a month-specific row overrides the "every month" row for the same category. */
export function effectiveBudgets<B extends BudgetRow>(budgets: B[], month: string): B[] {
  const byCat = new Map<string, B>();
  for (const b of budgets) {
    if (b.month !== month && b.month !== EVERY_MONTH) continue;
    const prev = byCat.get(b.category);
    if (!prev || (prev.month === EVERY_MONTH && b.month === month)) byCat.set(b.category, b);
  }
  return [...byCat.values()].sort((a, b) => (a.category === ALL_CATEGORIES ? -1 : b.category === ALL_CATEGORIES ? 1 : a.category.localeCompare(b.category)));
}

export function budgetProgress<B extends BudgetRow>(budgets: B[], month: string, expensesByCategory: Map<string, number>) {
  const total = [...expensesByCategory.values()].reduce((s, v) => s + v, 0);
  return effectiveBudgets(budgets, month).map((b) => {
    const spent = b.category === ALL_CATEGORIES ? total : expensesByCategory.get(b.category) ?? 0;
    return { ...b, spent, remaining: b.limit - spent, percent: b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0, state: budgetState(spent, b.limit) };
  });
}

// ------------------------------------------------------------------ export

export type ExportTx = {
  date: string;
  type: string;
  category: string;
  payee: string | null;
  accountId: string | null;
  toAccountId: string | null;
  paymentMethod: string | null;
  amount: number;
  note: string | null;
  tags: string[];
};

export const EXPORT_HEADER = ["Date", "Type", "Category", "Payee", "Account", "To account", "Payment method", "Income", "Expense", "Transfer", "Note", "Tags"];

const TYPE_LABEL: Record<string, string> = { expense: "Expense", income: "Income", transfer: "Transfer" };
const methodLabel = (m: string | null) => (m ? PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m : "");

/**
 * One row per transaction, in EXPORT_HEADER order. `amount` turns minor units
 * into the cell value (a number for Sheets, a plain decimal string for CSV).
 */
export function exportRows<V>(txs: ExportTx[], accountNames: Map<string, string>, amount: (minor: number) => V): (string | V | null)[][] {
  const name = (id: string | null) => (id ? accountNames.get(id) ?? "" : "");
  return txs.map((t) => [
    t.date,
    TYPE_LABEL[t.type] ?? t.type,
    t.category,
    t.payee ?? "",
    name(t.accountId),
    name(t.toAccountId),
    methodLabel(t.paymentMethod),
    t.type === "income" ? amount(t.amount) : null,
    t.type === "expense" ? amount(t.amount) : null,
    t.type === "transfer" ? amount(t.amount) : null,
    t.note ?? "",
    t.tags.join(", "),
  ]);
}

/** Neutralises spreadsheet formulas in text cells (CSV injection). */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvCell(v: string | null, raw: boolean): string {
  if (v === null) return "";
  const s = raw ? v : safeText(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text (with BOM so Excel reads UTF-8 and ₹ correctly). Amounts are plain decimals. */
export function toCsv(txs: ExportTx[], accountNames: Map<string, string>, currency: string): string {
  const amountCols = new Set([7, 8, 9]);
  const rows = exportRows(txs, accountNames, (m) => toPlainString(m, currency));
  const lines = [EXPORT_HEADER.map((h) => csvCell(h, true)).join(","), ...rows.map((r) => r.map((c, i) => csvCell(c, amountCols.has(i))).join(","))];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Rows for the "Summary by category" sheet: [Category, Expense, Income, Transactions] + total. */
export function categorySummaryRows(txs: ExportTx[], currency: string): (string | number)[][] {
  const groups = summarize(txs.filter((t) => t.type !== "transfer"), "category");
  const rows: (string | number)[][] = groups.map((g) => [g.key, toMajor(g.expense, currency), toMajor(g.income, currency), g.count]);
  const t = totalsOf(txs.filter((t) => t.type !== "transfer"));
  rows.push(["Total", toMajor(t.expense, currency), toMajor(t.income, currency), t.count]);
  return rows;
}
