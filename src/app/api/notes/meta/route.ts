import { db } from "@/lib/db";
import { route } from "@/lib/api";

/** Categories usable for notes, plus the tags in use on live notes (with counts). */
export const GET = route(async ({ user }) => {
  const [categories, tags] = await Promise.all([
    db.category.findMany({ where: { userId: user.id, kind: { in: ["note", "general"] } }, select: { id: true, name: true, color: true, kind: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, _count: { select: { notes: { where: { note: { deletedAt: null, archivedAt: null } } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { categories, tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.notes })) };
});
