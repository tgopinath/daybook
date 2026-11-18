import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api";

export const noteListSelect = {
  id: true,
  title: true,
  content: true,
  pinned: true,
  favorite: true,
  categoryId: true,
  archivedAt: true,
  deletedAt: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, color: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.NoteSelect;

type ListRow = Prisma.NoteGetPayload<{ select: typeof noteListSelect }>;

// The excerpt is derived from the document itself so it is always clean text.
export function toListItem(n: ListRow) {
  const { content, tags, ...rest } = n;
  return { ...rest, excerpt: extractText(content).replace(/\s+/g, " ").slice(0, 180), tags: tags.map((t) => t.tag) };
}

export async function getFullNote(userId: string, id: string) {
  const n = await db.note.findFirst({ where: { id, userId }, select: noteListSelect });
  if (!n) return null;
  return { ...toListItem(n), content: n.content };
}

/** Plain text of a TipTap JSON document (for search). */
export function extractText(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const o = n as { type?: string; text?: string; content?: unknown[] };
    if (typeof o.text === "string") out.push(o.text);
    if (Array.isArray(o.content)) {
      o.content.forEach(walk);
      if (o.type && o.type !== "text" && o.type !== "doc") out.push("\n");
    }
  };
  walk(node);
  return out.join("").replace(/\n{2,}/g, "\n").trim();
}

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** Replace a note's tags with the given names, creating tags on the fly. */
export async function setNoteTags(userId: string, noteId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 20);
  const tags = await Promise.all(
    clean.map((name) => db.tag.upsert({ where: { userId_name: { userId, name } }, update: {}, create: { userId, name } })),
  );
  await db.$transaction([
    db.noteTag.deleteMany({ where: { noteId } }),
    db.noteTag.createMany({ data: tags.map((t) => ({ noteId, tagId: t.id })), skipDuplicates: true }),
  ]);
}

export async function assertCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const c = await db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!c) throw notFound("Category");
}
