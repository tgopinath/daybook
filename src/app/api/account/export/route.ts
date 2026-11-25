import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { query, route } from "@/lib/api";
import { decryptJSON } from "@/lib/crypto";
import { publicSettings } from "@/lib/public-settings";

function strip<T extends Record<string, unknown>>(row: T) {
  const { userId: _u, ...rest } = row as T & { userId?: unknown };
  return rest;
}

/**
 * Everything the user owns as one JSON document (vault decrypted).
 * `?backup=1` only changes the filename to a timestamped backup name.
 */
export const GET = route(async ({ req, user }) => {
  const userId = user.id;
  const [settings, categories, projects, tags, tasks, goals, reminders, events, habits, notes, vault, notifications, conversations, recentSearches, attachments] =
    await Promise.all([
      db.userSettings.findUnique({ where: { userId } }),
      db.category.findMany({ where: { userId } }),
      db.project.findMany({ where: { userId } }),
      db.tag.findMany({ where: { userId } }),
      db.task.findMany({ where: { userId }, include: { subtasks: true, tags: { select: { tagId: true } } }, orderBy: { createdAt: "asc" } }),
      db.goal.findMany({ where: { userId }, include: { milestones: true, progressLogs: true }, orderBy: { createdAt: "asc" } }),
      db.reminder.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.calendarEvent.findMany({ where: { userId }, orderBy: { start: "asc" } }),
      db.habit.findMany({ where: { userId }, include: { entries: true }, orderBy: { createdAt: "asc" } }),
      db.note.findMany({ where: { userId }, include: { tags: { select: { tagId: true } } }, orderBy: { createdAt: "asc" } }),
      db.vaultItem.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.aIConversation.findMany({ where: { userId }, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
      db.recentSearch.findMany({ where: { userId } }),
      db.attachment.findMany({ where: { userId }, select: { id: true, taskId: true, fileName: true, mimeType: true, size: true, createdAt: true } }),
    ]);

  // Phase 1: journal, wellness, memories, photos, bucket list, timeline (media as metadata only).
  const [mediaFiles, journalEntries, gratitude, moods, albums, memories, photoCollections, photos, bucketItems, timelineEvents, weeklyReviews] = await Promise.all([
    db.mediaFile.findMany({
      where: { userId },
      select: { id: true, kind: true, mimeType: true, size: true, width: true, height: true, durationSec: true, originalName: true, source: true, takenAt: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.journalEntry.findMany({ where: { userId }, include: { tags: { select: { tagId: true } }, media: { select: { mediaId: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } }),
    db.gratitudeEntry.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    db.moodEntry.findMany({ where: { userId }, orderBy: { loggedAt: "asc" } }),
    db.album.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.memory.findMany({ where: { userId }, include: { media: { select: { mediaId: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { date: "asc" } }),
    db.photoCollection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.photoEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.bucketItem.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
    db.timelineEvent.findMany({ where: { userId }, include: { media: { select: { mediaId: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { date: "asc" } }),
    db.weeklyReview.findMany({ where: { userId }, orderBy: { weekStart: "asc" } }),
  ]);
  const mediaIdsOf = (links: { mediaId: string }[]) => links.map((l) => l.mediaId);

  const data = {
    app: "mydiary",
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email, createdAt: user.createdAt },
    settings: settings ? strip(publicSettings(settings)) : null,
    categories: categories.map(strip),
    projects: projects.map(strip),
    tags: tags.map(strip),
    tasks: tasks.map(({ tags: t, ...r }) => ({ ...strip(r), tagIds: t.map((x) => x.tagId) })),
    goals: goals.map(strip),
    reminders: reminders.map(strip),
    events: events.map(strip),
    habits: habits.map(strip),
    notes: notes.map(({ tags: t, ...r }) => ({ ...strip(r), tagIds: t.map((x) => x.tagId) })),
    vault: vault.map(({ fieldsEnc, ...r }) => {
      let fields: unknown = [];
      try {
        fields = decryptJSON(fieldsEnc);
      } catch {
        fields = [];
      }
      return { ...strip(r), fields };
    }),
    notifications: notifications.map(strip),
    conversations: conversations.map(strip),
    recentSearches: recentSearches.map((r) => ({ query: r.query, createdAt: r.createdAt })),
    attachments, // metadata only; file contents are not included
    mediaNote: "Photos, videos, audio and documents are not included in this file — only their details. Links to them are restored on import only when the file still exists in your account.",
    mediaFiles,
    journalEntries: journalEntries.map(({ tags: t, media: m, ...r }) => ({ ...strip(r), tagIds: t.map((x) => x.tagId), mediaIds: mediaIdsOf(m) })),
    gratitude: gratitude.map(strip),
    moods: moods.map(strip),
    albums: albums.map(strip),
    memories: memories.map(({ media: m, ...r }) => ({ ...strip(r), mediaIds: mediaIdsOf(m) })),
    photoCollections: photoCollections.map(strip),
    photos: photos.map(strip),
    bucketItems: bucketItems.map(strip),
    timelineEvents: timelineEvents.map(({ media: m, ...r }) => ({ ...strip(r), mediaIds: mediaIdsOf(m) })),
    weeklyReviews: weeklyReviews.map(strip),
  };

  const now = new Date();
  const stamp = query(req).get("backup") === "1" ? `backup-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}` : `export-${now.toISOString().slice(0, 10)}`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="mydiary-${stamp}.json"`,
      "cache-control": "no-store, private",
    },
  });
});
