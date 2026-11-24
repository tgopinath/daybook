import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { deleteObjects } from "@/lib/storage";
import { journalPreview } from "@/lib/journal";

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const journalListSelect = {
  id: true,
  title: true,
  plainText: true,
  entryDate: true,
  mood: true,
  isPrivate: true,
  isDraft: true,
  pinned: true,
  wordCount: true,
  archivedAt: true,
  deletedAt: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { id: true, name: true } } } },
  media: { select: { media: true }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.JournalEntrySelect;

type ListRow = Prisma.JournalEntryGetPayload<{ select: typeof journalListSelect }>;

/** List item: private entries never expose text or photos in previews. */
export function toListItem(e: ListRow) {
  const { plainText, tags, media, ...rest } = e;
  const ready = media.map((m) => m.media).filter((m) => m.status === "ready");
  const cover = e.isPrivate ? null : ready.find((m) => m.kind === "image");
  return {
    ...rest,
    preview: journalPreview({ plainText, isPrivate: e.isPrivate }),
    tags: tags.map((t) => t.tag),
    mediaCount: ready.length,
    cover: cover ? serializeMedia(cover) : null,
  };
}
export type JournalListItem = ReturnType<typeof toListItem>;

export async function getFullEntry(userId: string, id: string) {
  const e = await db.journalEntry.findFirst({ where: { id, userId }, select: { ...journalListSelect, content: true } });
  if (!e) return null;
  return {
    ...toListItem(e),
    content: e.content,
    plainText: e.plainText,
    media: e.media.map((m) => m.media).filter((m) => m.status === "ready").map(serializeMedia),
  };
}

/** Replace an entry's tags with the given names, creating tags on the fly. */
export async function setEntryTags(userId: string, entryId: string, names: string[]) {
  const clean = [...new Map(names.map((n) => n.trim().replace(/^#/, "").slice(0, 40)).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()].slice(0, 20);
  const tags = await Promise.all(
    clean.map(async (name) => {
      // Reuse an existing tag regardless of case ("Travel" = "travel").
      const found = await db.tag.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      return found ?? db.tag.upsert({ where: { userId_name: { userId, name } }, update: {}, create: { userId, name }, select: { id: true } });
    }),
  );
  await db.$transaction([
    db.journalTag.deleteMany({ where: { entryId } }),
    db.journalTag.createMany({ data: tags.map((t) => ({ entryId, tagId: t.id })), skipDuplicates: true }),
  ]);
}

/** Replace an entry's attachments (ordered). Every file must be the user's own and fully uploaded. */
export async function setEntryMedia(userId: string, entryId: string, mediaIds: string[]) {
  const ids = [...new Set(mediaIds)];
  if (ids.length) {
    const ok = await db.mediaFile.count({ where: { id: { in: ids }, userId, status: "ready" } });
    if (ok !== ids.length) throw new ApiError(400, "Some attachments couldn't be found or haven't finished uploading");
  }
  await db.$transaction([
    db.journalMedia.deleteMany({ where: { entryId, mediaId: { notIn: ids } } }),
    ...ids.map((mediaId, sortOrder) =>
      db.journalMedia.upsert({
        where: { entryId_mediaId: { entryId, mediaId } },
        update: { sortOrder },
        create: { entryId, mediaId, sortOrder },
      }),
    ),
  ]);
}

/**
 * Keep exactly one MoodEntry linked to a journal entry while it has a mood and isn't deleted,
 * so the Mood Tracker sees journal moods. Removes the link's mood entry otherwise.
 */
export async function syncMood(userId: string, entryId: string) {
  const e = await db.journalEntry.findFirst({ where: { id: entryId, userId }, select: { mood: true, entryDate: true, deletedAt: true, isDemo: true } });
  const linked = await db.moodEntry.findMany({ where: { userId, journalEntryId: entryId }, orderBy: { loggedAt: "asc" }, select: { id: true, mood: true, date: true } });
  if (!e || !e.mood || e.deletedAt) {
    if (linked.length) await db.moodEntry.deleteMany({ where: { userId, journalEntryId: entryId } });
    return;
  }
  const [first, ...extra] = linked;
  if (extra.length) await db.moodEntry.deleteMany({ where: { id: { in: extra.map((m) => m.id) } } });
  if (!first) {
    await db.moodEntry.create({ data: { userId, date: e.entryDate, mood: e.mood, journalEntryId: entryId, isDemo: e.isDemo } });
  } else if (first.mood !== e.mood || first.date !== e.entryDate) {
    await db.moodEntry.update({ where: { id: first.id }, data: { mood: e.mood, date: e.entryDate } });
  }
}

/** Hard-delete entries; also removes linked mood entries and files used by nothing else. */
export async function purgeEntries(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const links = await db.journalMedia.findMany({ where: { entryId: { in: ids }, entry: { userId } }, select: { mediaId: true } });
  const mediaIds = [...new Set(links.map((l) => l.mediaId))];
  await db.moodEntry.deleteMany({ where: { userId, journalEntryId: { in: ids } } });
  const res = await db.journalEntry.deleteMany({ where: { id: { in: ids }, userId } });
  if (mediaIds.length) {
    // After the cascade removed this entry's links, files with no other reference are orphans.
    const orphans = await db.mediaFile.findMany({
      where: {
        id: { in: mediaIds },
        userId,
        journal: { none: {} },
        memories: { none: {} },
        photos: { none: {} },
        bucketItems: { none: {} },
        timeline: { none: {} },
        albumCovers: { none: {} },
      },
      select: { id: true, storageKey: true },
    });
    if (orphans.length) {
      await deleteObjects(orphans.map((o) => o.storageKey)).catch((err) => console.error("journal: failed to delete media objects", err));
      await db.mediaFile.deleteMany({ where: { id: { in: orphans.map((o) => o.id) }, userId } });
    }
  }
  return res.count;
}
