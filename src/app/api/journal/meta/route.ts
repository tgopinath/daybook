import { db } from "@/lib/db";
import { route } from "@/lib/api";

/** Tags used on journal entries (with counts) for filters and suggestions, plus totals. */
export const GET = route(async ({ user }) => {
  const [tags, total, drafts, privateCount] = await Promise.all([
    db.tag.findMany({
      where: { userId: user.id, journalEntries: { some: { entry: { deletedAt: null } } } },
      select: { id: true, name: true, _count: { select: { journalEntries: { where: { entry: { deletedAt: null } } } } } },
      orderBy: { name: "asc" },
    }),
    db.journalEntry.count({ where: { userId: user.id, deletedAt: null, archivedAt: null } }),
    db.journalEntry.count({ where: { userId: user.id, deletedAt: null, archivedAt: null, isDraft: true } }),
    db.journalEntry.count({ where: { userId: user.id, deletedAt: null, archivedAt: null, isPrivate: true } }),
  ]);
  return { tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.journalEntries })), total, drafts, private: privateCount };
});
