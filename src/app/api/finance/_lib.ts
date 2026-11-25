import "server-only";
import { z } from "zod";
import type { Prisma, Transaction, FinanceAccount, MediaFile } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { deleteObjects } from "@/lib/storage";
import { AMOUNT_LIMIT, DEFAULT_CURRENCY } from "@/lib/money";
import { ACCOUNT_TYPES, PAYMENT_METHODS, TRANSFER_CATEGORY, TX_TYPES, computeBalances, isDayKey, normalizeTags } from "@/lib/finance";

export async function userCurrency(userId: string): Promise<string> {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { currency: true } });
  return s?.currency || DEFAULT_CURRENCY;
}

export async function userWeekStart(userId: string): Promise<number> {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { weekStart: true } });
  return s?.weekStart ?? 1;
}

// ------------------------------------------------------------------ schemas

export const dayKeySchema = z.string().refine(isDayKey, "Use a date like 2026-11-25");
export const amountSchema = z
  .number({ invalid_type_error: "Enter an amount" })
  .int("Amounts are whole minor units (e.g. paise)")
  .positive("Amount must be more than zero")
  .max(AMOUNT_LIMIT, `That amount is too large (the most a single entry can hold is ${AMOUNT_LIMIT.toLocaleString("en-US")} minor units)`);
const idSchema = z.string().min(1).max(40);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const categoryName = z.string().trim().min(1, "Choose a category").max(40);

export const txFields = {
  type: z.enum(TX_TYPES),
  amount: amountSchema,
  date: dayKeySchema,
  category: categoryName,
  accountId: idSchema.nullish(),
  toAccountId: idSchema.nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
  payee: optText(120),
  note: optText(1000),
  tags: z.array(z.string().max(40)).max(30).transform(normalizeTags),
  receiptMediaId: idSchema.nullish(),
};

export const txCreateSchema = z.object({
  ...txFields,
  date: dayKeySchema.optional(),
  category: categoryName.optional(),
  tags: txFields.tags.optional(),
});

export const txPatchSchema = z
  .object({
    ...txFields,
    deletedAt: z.null(),
    archived: z.boolean(), // contract parity; transactions have no archive state
  })
  .partial();

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(60),
  type: z.enum(ACCOUNT_TYPES).default("bank"),
  openingBalance: z.number().int().min(-AMOUNT_LIMIT).max(AMOUNT_LIMIT).default(0),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

// ------------------------------------------------------------------ checks

/** Every referenced account must belong to the user. */
export async function assertAccounts(userId: string, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return;
  const n = await db.financeAccount.count({ where: { id: { in: list }, userId } });
  if (n !== list.length) throw notFound("Account");
}

/** Receipt must be the user's own, finished upload (photo or PDF). */
export async function assertReceipt(userId: string, mediaId: string | null | undefined) {
  if (!mediaId) return;
  const m = await db.mediaFile.findFirst({ where: { id: mediaId, userId, status: "ready" }, select: { kind: true } });
  if (!m) throw new ApiError(400, "That receipt upload wasn't found. Please upload it again.");
  if (m.kind !== "image" && m.kind !== "document") throw new ApiError(400, "Receipts must be a photo or a PDF");
}

/** Normalises transfer/non-transfer fields and checks they make sense. */
export function shapeTransfer<T extends { type: string; accountId?: string | null; toAccountId?: string | null; category?: string; paymentMethod?: string | null }>(t: T): T {
  if (t.type === "transfer") {
    if (!t.accountId || !t.toAccountId) throw new ApiError(400, "A transfer needs a from and a to account");
    if (t.accountId === t.toAccountId) throw new ApiError(400, "Pick two different accounts for a transfer");
    return { ...t, category: TRANSFER_CATEGORY };
  }
  return { ...t, toAccountId: null, category: !t.category || t.category === TRANSFER_CATEGORY ? "Other" : t.category };
}

// ------------------------------------------------------------------ serialisation

type TxWithReceipt = Transaction & { receipt?: MediaFile | null };

export function serializeTx(t: TxWithReceipt) {
  const { userId: _u, receipt, ...rest } = t;
  return {
    ...rest,
    title: t.payee || t.category, // soft-delete contract: every list item has a title
    archivedAt: null,
    receipt: receipt && receipt.status === "ready" ? serializeMedia(receipt) : null,
  };
}
export type TxDTO = ReturnType<typeof serializeTx>;

export async function accountsWithBalances(userId: string, opts: { includeArchived?: boolean } = {}) {
  const accounts = await db.financeAccount.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
  });
  const groups = await db.transaction.groupBy({
    by: ["type", "accountId", "toAccountId"],
    where: { userId, deletedAt: null },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const rows = groups.map((g) => ({ type: g.type, accountId: g.accountId, toAccountId: g.toAccountId, amount: g._sum.amount ?? 0 }));
  const bal = computeBalances(accounts, rows);
  const counts = new Map<string, number>();
  for (const g of groups) {
    for (const id of [g.accountId, g.toAccountId]) if (id) counts.set(id, (counts.get(id) ?? 0) + g._count._all);
  }
  return accounts.map((a) => serializeAccount(a, bal.get(a.id) ?? a.openingBalance, counts.get(a.id) ?? 0));
}

export function serializeAccount(a: FinanceAccount, balance: number, txCount = 0) {
  const { userId: _u, ...rest } = a;
  return { ...rest, balance, txCount };
}

// ------------------------------------------------------------------ filters

export type TxFilter = {
  scope: "active" | "trash";
  from?: string;
  to?: string;
  types?: string[];
  categories?: string[];
  accountId?: string;
  methods?: string[];
  min?: number;
  max?: number;
  q?: string;
};

const list = (v: string | null) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30)
    : undefined;

const int = (v: string | null) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

export function readFilter(sp: URLSearchParams): TxFilter {
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  if (from && !isDayKey(from)) throw new ApiError(400, "from: use a date like 2026-11-01");
  if (to && !isDayKey(to)) throw new ApiError(400, "to: use a date like 2026-11-30");
  return {
    scope: sp.get("scope") === "trash" ? "trash" : "active",
    from,
    to,
    types: list(sp.get("type"))?.filter((t) => (TX_TYPES as readonly string[]).includes(t)),
    categories: list(sp.get("category")),
    accountId: sp.get("account") || undefined,
    methods: list(sp.get("method"))?.filter((m) => (PAYMENT_METHODS as readonly string[]).includes(m) || m === "none"),
    min: int(sp.get("min")),
    max: int(sp.get("max")),
    q: sp.get("q")?.trim().slice(0, 100) || undefined,
  };
}

export function whereOf(userId: string, f: TxFilter): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];
  const where: Prisma.TransactionWhereInput = { userId, deletedAt: f.scope === "trash" ? { not: null } : null };
  if (f.from || f.to) where.date = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.types?.length) where.type = { in: f.types };
  if (f.categories?.length) where.category = { in: f.categories };
  if (f.accountId) and.push({ OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] });
  if (f.methods?.length) {
    const named = f.methods.filter((m) => m !== "none");
    and.push({ OR: [...(named.length ? [{ paymentMethod: { in: named } }] : []), ...(f.methods.includes("none") ? [{ paymentMethod: null }] : [])] });
  }
  if (f.min !== undefined || f.max !== undefined) where.amount = { ...(f.min !== undefined ? { gte: f.min } : {}), ...(f.max !== undefined ? { lte: f.max } : {}) };
  if (f.q) {
    const tag = f.q.replace(/^#/, "").toLowerCase();
    and.push({
      OR: [
        { payee: { contains: f.q, mode: "insensitive" } },
        { note: { contains: f.q, mode: "insensitive" } },
        { category: { contains: f.q, mode: "insensitive" } },
        { tags: { has: tag } },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

// ------------------------------------------------------------------ cleanup

/** After a permanent delete: remove the receipt file if nothing else uses it. */
export async function deleteOrphanReceipt(userId: string, mediaId: string | null) {
  if (!mediaId) return;
  const m = await db.mediaFile.findFirst({
    where: { id: mediaId, userId },
    include: { _count: { select: { receipts: true, driveFiles: true, journal: true, memories: true, photos: true, bucketItems: true, timeline: true, albumCovers: true } } },
  });
  if (!m) return;
  const used = Object.values(m._count).some((n) => n > 0);
  if (used) return;
  try {
    await deleteObjects([m.storageKey]);
  } catch (err) {
    console.error("[finance] could not delete receipt object", err);
  }
  await db.mediaFile.deleteMany({ where: { id: m.id, userId } });
}

/** A valid yyyy-MM-dd from the query, else the fallback. */
export function isDayKeyOr(v: string | null, fallback: string) {
  return v && isDayKey(v) ? v : fallback;
}
