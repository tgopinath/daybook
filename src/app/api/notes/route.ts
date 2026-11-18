import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";
import { EMPTY_DOC, assertCategory, extractText, getFullNote, noteListSelect, setNoteTags, toListItem } from "./_lib";

export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  const q = sp.get("q")?.trim();
  const where: Prisma.NoteWhereInput = { userId: user.id };
  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { plainText: { contains: q, mode: "insensitive" } }];
  const categoryId = sp.get("categoryId");
  if (categoryId) where.categoryId = categoryId;
  const tag = sp.get("tag");
  if (tag) where.tags = { some: { tagId: tag } };
  if (sp.get("filter") === "pinned") where.pinned = true;
  if (sp.get("filter") === "favorites") where.favorite = true;
  const rows = await db.note.findMany({
    where,
    select: noteListSelect,
    orderBy: scope === "trash" ? [{ deletedAt: "desc" }] : [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  return { items: rows.map(toListItem) };
});

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.record(z.unknown()).optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  await assertCategory(user.id, input.categoryId);
  const content = (input.content ?? EMPTY_DOC) as Prisma.InputJsonValue;
  const note = await db.note.create({
    data: {
      userId: user.id,
      title: input.title || "Untitled",
      content,
      plainText: extractText(content).slice(0, 100_000),
      categoryId: input.categoryId ?? null,
      pinned: input.pinned ?? false,
      favorite: input.favorite ?? false,
    },
  });
  if (input.tags?.length) await setNoteTags(user.id, note.id, input.tags);
  return { item: await getFullNote(user.id, note.id) };
});
