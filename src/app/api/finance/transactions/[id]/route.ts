import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { assertAccounts, assertReceipt, deleteOrphanReceipt, serializeTx, shapeTransfer, txPatchSchema } from "../../_lib";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const row = await db.transaction.findFirst({ where: { id: params.id, userId: user.id }, include: { receipt: true } });
  if (!row) throw notFound("Transaction");
  return { item: serializeTx(row) };
});

/** Field updates, plus `{ deletedAt: null }` to restore (soft-delete contract). */
export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, txPatchSchema);
  const row = await db.transaction.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) throw notFound("Transaction");
  const { deletedAt, archived: _a, ...fields } = input;
  const merged = shapeTransfer({
    type: fields.type ?? row.type,
    accountId: fields.accountId !== undefined ? fields.accountId : row.accountId,
    toAccountId: fields.toAccountId !== undefined ? fields.toAccountId : row.toAccountId,
    category: fields.category ?? row.category,
    paymentMethod: fields.paymentMethod !== undefined ? fields.paymentMethod : row.paymentMethod,
  });
  const accountsChanged = fields.accountId !== undefined || fields.toAccountId !== undefined || fields.type !== undefined;
  if (accountsChanged) await assertAccounts(user.id, [merged.accountId, merged.toAccountId]);
  if (fields.receiptMediaId) await assertReceipt(user.id, fields.receiptMediaId);
  const oldReceipt = row.receiptMediaId;
  const updated = await db.transaction.update({
    where: { id: row.id },
    data: {
      type: merged.type,
      accountId: merged.accountId ?? null,
      toAccountId: merged.toAccountId ?? null,
      category: merged.category,
      paymentMethod: merged.type === "transfer" ? null : merged.paymentMethod ?? null,
      ...(fields.amount !== undefined ? { amount: fields.amount } : {}),
      ...(fields.date !== undefined ? { date: fields.date } : {}),
      ...(fields.payee !== undefined ? { payee: fields.payee } : {}),
      ...(fields.note !== undefined ? { note: fields.note } : {}),
      ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
      ...(fields.receiptMediaId !== undefined ? { receiptMediaId: fields.receiptMediaId ?? null } : {}),
      ...(deletedAt === null ? { deletedAt: null } : {}),
    },
    include: { receipt: true },
  });
  // A replaced/removed receipt that nothing else uses is cleaned up.
  if (fields.receiptMediaId !== undefined && oldReceipt && oldReceipt !== updated.receiptMediaId) await deleteOrphanReceipt(user.id, oldReceipt);
  return { item: serializeTx(updated) };
});

/** Soft delete; `?permanent=1` hard-deletes (and removes a receipt only this row used). */
export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const permanent = query(req).get("permanent") === "1";
  const row = await db.transaction.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true, receiptMediaId: true } });
  if (!row) throw notFound("Transaction");
  if (permanent) {
    await db.transaction.deleteMany({ where: { id: row.id, userId: user.id } });
    await deleteOrphanReceipt(user.id, row.receiptMediaId);
  } else {
    await db.transaction.updateMany({ where: { id: row.id, userId: user.id }, data: { deletedAt: new Date() } });
  }
  return { ok: true };
});
