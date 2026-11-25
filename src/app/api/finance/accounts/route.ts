import { db } from "@/lib/db";
import { ApiError, body, query, route } from "@/lib/api";
import { accountCreateSchema, accountsWithBalances, serializeAccount } from "../_lib";

/** Accounts with computed balances. `?all=1` includes archived ones; `?scope=archived` only archived. */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  const all = await accountsWithBalances(user.id, { includeArchived: true });
  if (scope === "archived") return { items: all.filter((a) => a.archivedAt) };
  if (scope === "trash") return { items: [] }; // accounts have no trash
  return { items: sp.get("all") === "1" ? all : all.filter((a) => !a.archivedAt) };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, accountCreateSchema);
  const count = await db.financeAccount.count({ where: { userId: user.id } });
  if (count >= 50) throw new ApiError(400, "You can have up to 50 accounts");
  const row = await db.financeAccount.create({ data: { userId: user.id, ...input } });
  return { item: serializeAccount(row, row.openingBalance) };
});
