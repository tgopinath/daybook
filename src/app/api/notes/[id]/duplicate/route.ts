import { db } from "@/lib/db";
import { notFound, route } from "@/lib/api";
import { getFullNote } from "../../_lib";

export const POST = route<{ id: string }>(async ({ user, params }) => {
  const src = await db.note.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null }, include: { tags: true } });
  if (!src) throw notFound("Note");
  const copy = await db.note.create({
    data: {
      userId: user.id,
      title: `${src.title} (copy)`.slice(0, 200),
      content: src.content ?? {},
      plainText: src.plainText,
      categoryId: src.categoryId,
      favorite: src.favorite,
      tags: { create: src.tags.map((t) => ({ tagId: t.tagId })) },
    },
  });
  return { item: await getFullNote(user.id, copy.id) };
});
