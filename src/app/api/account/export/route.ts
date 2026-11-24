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
