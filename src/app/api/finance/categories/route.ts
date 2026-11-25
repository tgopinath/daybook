import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { DEFAULT_CATEGORIES, TRANSFER_CATEGORY } from "@/lib/finance";

/** Curated categories plus custom names the user has already used (most used first). */
export const GET = route(async ({ user }) => {
  const used = await db.transaction.groupBy({
    by: ["category", "type"],
    where: { userId: user.id, deletedAt: null, type: { in: ["expense", "income"] } },
    _count: { _all: true },
  });
  const defaults = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
  const custom = new Map<string, { name: string; kinds: Set<string>; count: number }>();
  for (const u of used) {
    if (defaults.has(u.category) || u.category === TRANSFER_CATEGORY) continue;
    const c = custom.get(u.category) ?? { name: u.category, kinds: new Set<string>(), count: 0 };
    c.kinds.add(u.type);
    c.count += u._count._all;
    custom.set(u.category, c);
  }
  const budgetCats = await db.budget.findMany({ where: { userId: user.id }, select: { category: true }, distinct: ["category"] });
  for (const b of budgetCats) {
    if (b.category !== "*" && !defaults.has(b.category) && !custom.has(b.category)) custom.set(b.category, { name: b.category, kinds: new Set(["expense"]), count: 0 });
  }
  return {
    defaults: DEFAULT_CATEGORIES,
    custom: [...custom.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((c) => ({ name: c.name, kind: c.kinds.size > 1 ? "both" : ([...c.kinds][0] ?? "expense"), count: c.count })),
  };
});
