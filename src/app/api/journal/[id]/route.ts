import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { MOOD_VALUES } from "@/lib/moods";
import { countWords, extractText } from "@/lib/journal";
import { DAY_RE, getFullEntry, purgeEntries, setEntryMedia, setEntryTags, syncMood } from "../_lib";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const item = await getFullEntry(user.id, params.id);
  if (!item) throw notFound("Journal entry");
  return { item };
});

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.record(z.unknown()).optional(),
  entryDate: z.string().regex(DAY_RE, "Use yyyy-MM-dd").optional(),
  mood: z.enum(MOOD_VALUES).nullable().optional(),
  isPrivate: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  mediaIds: z.array(z.string().min(1).max(64)).max(60).optional(),
  archived: z.boolean().optional(),
  deletedAt: z.null().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const existing = await db.journalEntry.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Journal entry");
  const data: Prisma.JournalEntryUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) {
    const plainText = extractText(input.content).slice(0, 200_000);
    data.content = input.content as Prisma.InputJsonValue;
    data.plainText = plainText;
    data.wordCount = countWords(plainText);
  }
  if (input.entryDate !== undefined) data.entryDate = input.entryDate;
  if (input.mood !== undefined) data.mood = input.mood;
  if (input.isPrivate !== undefined) data.isPrivate = input.isPrivate;
  if (input.isDraft !== undefined) data.isDraft = input.isDraft;
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.deletedAt === null) data.deletedAt = null;
  if (input.mediaIds) await setEntryMedia(user.id, existing.id, input.mediaIds);
  await db.journalEntry.update({ where: { id: existing.id }, data });
  if (input.tags) await setEntryTags(user.id, existing.id, input.tags);
  if (input.mood !== undefined || input.entryDate !== undefined || input.deletedAt === null) await syncMood(user.id, existing.id);
  return { item: await getFullEntry(user.id, existing.id) };
});

export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const permanent = query(req).get("permanent") === "1";
  if (permanent) {
    const n = await purgeEntries(user.id, [params.id]);
    if (!n) throw notFound("Journal entry");
    return { ok: true };
  }
  const res = await db.journalEntry.updateMany({ where: { id: params.id, userId: user.id }, data: { deletedAt: new Date() } });
  if (!res.count) throw notFound("Journal entry");
  await syncMood(user.id, params.id);
  return { ok: true };
});
