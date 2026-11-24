import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { MOOD_VALUES } from "@/lib/moods";
import { EMPTY_JOURNAL_DOC, JOURNAL_PAGE_SIZE, countWords, extractText } from "@/lib/journal";
import { DAY_RE, getFullEntry, journalListSelect, setEntryMedia, setEntryTags, syncMood, toListItem } from "./_lib";

export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  const where: Prisma.JournalEntryWhereInput = { userId: user.id };
  const and: Prisma.JournalEntryWhereInput[] = [];
  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });

  const q = sp.get("q")?.trim().slice(0, 200);
  if (q) {
    // Private entries are searchable by title only, never by their text.
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { isPrivate: false, plainText: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const mood = sp.get("mood");
  if (mood) {
    if (!(MOOD_VALUES as readonly string[]).includes(mood)) throw new ApiError(400, "Unknown mood");
    where.mood = mood;
  }
  const tag = sp.get("tag");
  if (tag) where.tags = { some: { tagId: tag } };
  const from = sp.get("from");
  const to = sp.get("to");
  if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) throw new ApiError(400, "Dates must be yyyy-MM-dd");
  if (from || to) where.entryDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const status = sp.get("status");
  if (status === "private") where.isPrivate = true;
  else if (status === "drafts") where.isDraft = true;
  else if (status === "pinned") where.pinned = true;
  if (and.length) where.AND = and;

  const cursor = sp.get("cursor");
  const orderBy: Prisma.JournalEntryOrderByWithRelationInput[] =
    scope === "trash"
      ? [{ deletedAt: "desc" }, { id: "desc" }]
      : [{ pinned: "desc" }, { entryDate: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  const rows = await db.journalEntry.findMany({
    where,
    select: journalListSelect,
    orderBy,
    take: JOURNAL_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, JOURNAL_PAGE_SIZE);
  return { items: page.map(toListItem), nextCursor: rows.length > JOURNAL_PAGE_SIZE ? page[page.length - 1]!.id : null };
});

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.record(z.unknown()).optional(),
  entryDate: z.string().regex(DAY_RE).optional(),
  mood: z.enum(MOOD_VALUES).nullable().optional(),
  isPrivate: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  mediaIds: z.array(z.string().min(1).max(64)).max(60).optional(),
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  const content = (input.content ?? EMPTY_JOURNAL_DOC) as Prisma.InputJsonValue;
  const plainText = extractText(content).slice(0, 200_000);
  const entry = await db.journalEntry.create({
    data: {
      userId: user.id,
      title: input.title ?? "",
      content,
      plainText,
      wordCount: countWords(plainText),
      entryDate: input.entryDate ?? dayKey(new Date(), tzOf(req)),
      mood: input.mood ?? null,
      isPrivate: input.isPrivate ?? false,
      isDraft: input.isDraft ?? true,
      pinned: input.pinned ?? false,
    },
  });
  try {
    if (input.tags?.length) await setEntryTags(user.id, entry.id, input.tags);
    if (input.mediaIds?.length) await setEntryMedia(user.id, entry.id, input.mediaIds);
  } catch (err) {
    await db.journalEntry.delete({ where: { id: entry.id } }).catch(() => {});
    throw err;
  }
  if (entry.mood) await syncMood(user.id, entry.id);
  return { item: await getFullEntry(user.id, entry.id) };
});
