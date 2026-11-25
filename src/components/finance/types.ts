import type { Media } from "@/lib/upload";
import type { BudgetState, CategoryKind, Totals } from "@/lib/finance";

export type TxType = "expense" | "income" | "transfer";

export type Tx = {
  id: string;
  type: TxType;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  category: string;
  paymentMethod: string | null;
  date: string;
  note: string | null;
  payee: string | null;
  tags: string[];
  receiptMediaId: string | null;
  receipt: Media | null;
  deletedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  title: string;
};

export type DayTotal = { income: number; expense: number; count: number };
export type TxPage = { items: Tx[]; nextCursor: string | null; totals: Totals; dayTotals: Record<string, DayTotal> };

export type Account = {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  color: string;
  archivedAt: string | null;
  balance: number;
  txCount: number;
  createdAt: string;
};

export type Budget = { id: string; category: string; month: string; limit: number };
export type BudgetProgress = Budget & { spent: number; remaining: number; percent: number; state: BudgetState };
export type BudgetsResponse = { month: string; items: Budget[]; progress: BudgetProgress[] };

export type CategoriesResponse = {
  defaults: { name: string; kind: CategoryKind; icon: string }[];
  custom: { name: string; kind: CategoryKind; count: number }[];
};

export type SheetsStatus = { available: boolean; reason: string | null; message: string | null; connected: boolean };
export type FinanceSettings = { currency: string; sheets: SheetsStatus };

export type Overview = {
  from: string;
  to: string;
  today: string;
  currency: string;
  weekStart: number;
  totals: Totals;
  previous: Totals & { from: string; to: string };
  byCategory: { key: string; amount: number; count: number }[];
  byMethod: { key: string; amount: number; count: number }[];
  daily: { key: string; income: number; expense: number }[];
  weekly: { key: string; income: number; expense: number }[];
  trend: { key: string; income: number; expense: number; net: number }[];
  accounts: Account[];
  budgetMonth: string;
  budgets: BudgetProgress[];
};

/** Filters shared by the list and sheet views. Amounts in minor units. */
export type Filters = {
  from: string;
  to: string;
  preset: "this_month" | "last_month" | "this_year" | "last_30" | "all" | "custom";
  q: string;
  type: "" | TxType;
  category: string;
  account: string;
  method: string;
  min: number | null;
  max: number | null;
  sort: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};
