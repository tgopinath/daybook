import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, notFound, route } from "@/lib/api";
import { accountCreateSchema, accountsWithBalances } from "../../_lib";

const patchSchema = accountCreateSchema.partial().extend({ archived: z.boolean().optional() });

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const { archived, ...fields } = await body(req, patchSchema);
  const row = await db.financeAccount.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) throw notFound("Account");
  await db.financeAccount.update({
    where: { id: row.id },
    data: { ...fields, ...(archived !== undefined ? { archivedAt: archived ? row.archivedAt ?? new Date() : null } : {}) },
  });
  const item = (await accountsWithBalances(user.id, { includeArchived: true })).find((a) => a.id === row.id);
  return { item };
});

/** Deletes an account that has no transactions; otherwise suggests archiving it. */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const row = await db.financeAccount.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!row) throw notFound("Account");
  const used = await db.transaction.count({ where: { userId: user.id, OR: [{ accountId: row.id }, { toAccountId: row.id }] } });
  if (used) throw new ApiError(409, `This account has ${used} transaction${used === 1 ? "" : "s"} (including any in the trash). Archive it instead to keep its history.`);
  await db.financeAccount.deleteMany({ where: { id: row.id, userId: user.id } });
  return { ok: true };
});
