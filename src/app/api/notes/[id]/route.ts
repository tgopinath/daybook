import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { assertCategory, extractText, getFullNote, setNoteTags } from "../_lib";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const item = await getFullNote(user.id, params.id);
  if (!item) throw notFound("Note");
  return { item };
});

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.record(z.unknown()).optional(),
  plainText: z.string().max(100_000).optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  deletedAt: z.null().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const existing = await db.note.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Note");
  if (input.categoryId !== undefined) await assertCategory(user.id, input.categoryId);
  const data: Prisma.NoteUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title || "Untitled";
  if (input.content !== undefined) {
    data.content = input.content as Prisma.InputJsonValue;
    data.plainText = (input.plainText ?? extractText(input.content)).slice(0, 100_000);
  }
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.favorite !== undefined) data.favorite = input.favorite;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.deletedAt === null) data.deletedAt = null;
  await db.note.update({ where: { id: existing.id }, data });
  if (input.tags) await setNoteTags(user.id, existing.id, input.tags);
  return { item: await getFullNote(user.id, existing.id) };
});

export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const permanent = query(req).get("permanent") === "1";
  const where = { id: params.id, userId: user.id };
  const res = permanent ? await db.note.deleteMany({ where }) : await db.note.updateMany({ where, data: { deletedAt: new Date() } });
  if (!res.count) throw notFound("Note");
  return { ok: true };
});
