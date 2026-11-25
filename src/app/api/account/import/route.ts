import { randomUUID } from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, query, route } from "@/lib/api";
import { encryptJSON } from "@/lib/crypto";
import { VAULT_CATEGORIES, vaultProblem } from "@/components/vault/guard";
import { MOOD_VALUES } from "@/lib/moods";
import { BUCKET_CATEGORIES } from "@/components/bucket-list/meta";
import { DATE_PRECISIONS, TIMELINE_CATEGORIES } from "@/components/timeline/meta";

// Validation for files produced by GET /api/account/export (version 1).
const id = z.string().min(1).max(200);
const optId = id.nullable().optional();
const date = z.coerce.date();
const optDate = z.coerce.date().nullable().optional();
const str = (max: number) => z.string().max(max);
const optStr = (max: number) => z.string().max(max).nullable().optional();
const MAX = 20_000;
const arr = <T extends z.ZodTypeAny>(s: T) => z.array(s).max(MAX).default([]);
const priority = z.enum(["HIGH", "MEDIUM", "LOW"]).catch("MEDIUM");
const recurrence = z.enum(["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"]).catch("NONE");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).catch("#993399");
const flag = z.boolean().default(false);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mediaIds = z.array(id).max(200).default([]);
const mood = z.enum(MOOD_VALUES);

const schema = z.object({
  // "daybook" files come from before the rename to MyDiary and import the same way.
  app: z.enum(["mydiary", "daybook"], { errorMap: () => ({ message: "This isn't a MyDiary export file" }) }),
  version: z.literal(1, { errorMap: () => ({ message: "Unsupported export version" }) }),
  categories: arr(z.object({ id, name: str(80), color: color.optional(), kind: str(20).default("general") })),
  projects: arr(z.object({ id, name: str(80), color: color.optional(), archived: flag })),
  tags: arr(z.object({ id, name: str(40) })),
  tasks: arr(
    z.object({
      id,
      title: str(500),
      description: optStr(20_000),
      dueDate: optDate,
      startTime: optStr(5),
      endTime: optStr(5),
      priority,
      status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).catch("NOT_STARTED"),
      categoryId: optId,
      projectId: optId,
      goalId: optId,
      milestoneId: optId,
      eventId: optId,
      recurrence,
      recurrenceRule: optStr(500),
      reminderAt: optDate,
      focusRank: z.number().int().nullable().optional(),
      sortOrder: z.number().default(0),
      completedAt: optDate,
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      subtasks: arr(z.object({ title: str(500), done: flag, sortOrder: z.number().int().default(0) })),
      tagIds: z.array(id).max(50).default([]),
    }),
  ),
  goals: arr(
    z.object({
      id,
      title: str(500),
      description: optStr(20_000),
      category: str(40).default("Personal"),
      startDate: optDate,
      targetDate: optDate,
      targetValue: z.number().nullable().optional(),
      currentValue: z.number().default(0),
      unit: optStr(40),
      notes: optStr(20_000),
      status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ABANDONED"]).catch("ACTIVE"),
      color: color.optional(),
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      milestones: arr(z.object({ id, title: str(500), dueDate: optDate, done: flag, completedAt: optDate, sortOrder: z.number().int().default(0) })),
      progressLogs: arr(z.object({ value: z.number(), createdAt: optDate })),
    }),
  ),
  reminders: arr(
    z.object({
      id,
      title: str(500),
      notes: optStr(5000),
      kind: str(20).default("custom"),
      remindAt: date,
      recurrence,
      intervalMinutes: z.number().int().nullable().optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
      endsAt: optDate,
      status: z.enum(["ACTIVE", "COMPLETED"]).catch("ACTIVE"),
      snoozedUntil: optDate,
      lastFiredAt: optDate,
      taskId: optId,
      eventId: optId,
      habitId: optId,
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
    }),
  ),
  events: arr(
    z.object({
      id,
      title: str(500),
      description: optStr(20_000),
      location: optStr(500),
      start: date,
      end: date,
      allDay: flag,
      kind: str(20).default("event"),
      color: optStr(20),
      categoryId: optId,
      recurrence,
      deletedAt: optDate,
      isDemo: flag,
    }),
  ),
  habits: arr(
    z.object({
      id,
      name: str(200),
      description: optStr(5000),
      icon: str(40).default("check"),
      color: color.optional(),
      frequency: str(20).default("daily"),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
      targetPerDay: z.number().int().min(1).default(1),
      reminderTime: optStr(5),
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      entries: arr(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), count: z.number().int().min(0).default(1) })),
    }),
  ),
  notes: arr(
    z.object({
      id,
      title: str(200).default("Untitled"),
      content: z.unknown().optional(),
      plainText: str(100_000).default(""),
      categoryId: optId,
      pinned: flag,
      favorite: flag,
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      tagIds: z.array(id).max(50).default([]),
    }),
  ),
  vault: arr(
    z.object({
      category: z.enum(VAULT_CATEGORIES).catch("Custom"),
      title: str(120),
      fields: z.array(z.object({ label: str(60), value: str(2000), sensitive: flag })).max(40).default([]),
      deletedAt: optDate,
      isDemo: flag,
    }),
  ),
  // Phase 1 (absent in older exports).
  journalEntries: arr(
    z.object({
      id,
      title: str(200).default(""),
      content: z.unknown().optional(),
      plainText: str(200_000).default(""),
      entryDate: dayKey,
      mood: mood.nullable().optional().catch(null),
      isPrivate: flag,
      isDraft: flag,
      pinned: flag,
      wordCount: z.number().int().min(0).default(0),
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      tagIds: z.array(id).max(50).default([]),
      mediaIds,
    }),
  ),
  gratitude: arr(z.object({ date: dayKey, items: z.array(str(500)).max(10).default([]), prompt: optStr(500), note: optStr(5000), isDemo: flag, createdAt: optDate })),
  moods: arr(
    z.object({
      date: dayKey,
      mood,
      intensity: z.number().int().min(1).max(5).default(3),
      note: optStr(5000),
      factors: z.array(str(40)).max(30).default([]),
      journalEntryId: optId,
      loggedAt: optDate,
      isDemo: flag,
    }),
  ),
  albums: arr(z.object({ id, title: str(200), description: optStr(5000), coverMediaId: optId, createdAt: optDate })),
  memories: arr(
    z.object({
      id,
      title: str(300),
      caption: optStr(10_000),
      date,
      location: optStr(300),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
      albumId: optId,
      favorite: flag,
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      mediaIds,
    }),
  ),
  photoCollections: arr(z.object({ id, title: str(200), description: optStr(5000), createdAt: optDate })),
  photos: arr(z.object({ mediaId: id, caption: optStr(2000), tags: z.array(str(60)).max(50).default([]), takenOn: dayKey, collectionId: optId, favorite: flag, deletedAt: optDate, createdAt: optDate })),
  bucketItems: arr(
    z.object({
      title: str(200),
      description: optStr(5000),
      category: z.enum(BUCKET_CATEGORIES).catch("Personal"),
      targetDate: optDate,
      completedAt: optDate,
      imageMediaId: optId,
      sortOrder: z.number().default(0),
      archivedAt: optDate,
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
    }),
  ),
  timelineEvents: arr(
    z.object({
      title: str(200),
      description: optStr(10_000),
      date,
      datePrecision: z.enum(DATE_PRECISIONS).catch("day"),
      category: z.enum(TIMELINE_CATEGORIES).catch("Personal"),
      deletedAt: optDate,
      isDemo: flag,
      createdAt: optDate,
      mediaIds,
    }),
  ),
  weeklyReviews: arr(
    z.object({
      weekStart: dayKey,
      rating: z.number().int().min(1).max(5).nullable().optional(),
      wins: optStr(10_000),
      challenges: optStr(10_000),
      lessons: optStr(10_000),
      nextWeekFocus: optStr(10_000),
      aiSummary: optStr(20_000),
    }),
  ),
});

type Input = z.infer<typeof schema>;
const newId = () => `c${randomUUID().replace(/-/g, "").slice(0, 24)}`;

function summarize(d: Input, vaultSkipped: number) {
  return {
    categories: d.categories.length,
    projects: d.projects.length,
    tags: d.tags.length,
    tasks: d.tasks.length,
    subtasks: d.tasks.reduce((n, t) => n + t.subtasks.length, 0),
    goals: d.goals.length,
    milestones: d.goals.reduce((n, g) => n + g.milestones.length, 0),
    reminders: d.reminders.length,
    events: d.events.length,
    habits: d.habits.length,
    habitEntries: d.habits.reduce((n, h) => n + h.entries.length, 0),
    notes: d.notes.length,
    vault: d.vault.length - vaultSkipped,
    vaultSkipped,
    journalEntries: d.journalEntries.length,
    gratitude: d.gratitude.length,
    moods: d.moods.length,
    albums: d.albums.length,
    memories: d.memories.length,
    photoCollections: d.photoCollections.length,
    photos: d.photos.length,
    bucketItems: d.bucketItems.length,
    timelineEvents: d.timelineEvents.length,
    weeklyReviews: d.weeklyReviews.length,
  };
}

/**
 * Imports a MyDiary export as new rows under the current user.
 * `?dryRun=1` validates and returns the summary without writing anything.
 */
export const POST = route(async ({ req, user }) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "The file isn't valid JSON");
  }
  const d = schema.parse(raw);
  const vaultOk = d.vault.filter((v) => !vaultProblem(v.title, v.fields));
  const summary = summarize(d, d.vault.length - vaultOk.length);
  if (query(req).get("dryRun") === "1") return { summary };

  const userId = user.id;
  const map = <K extends string>() => new Map<K, string>();
  const catMap = map(), projMap = map(), tagMap = map(), goalMap = map(), msMap = map(), eventMap = map(), habitMap = map(), taskMap = map();
  const ref = (m: Map<string, string>, k: string | null | undefined) => (k ? (m.get(k) ?? null) : null);

  // Reuse categories / projects / tags that already exist by name (they are unique per user).
  const [exCats, exProjects, exTags] = await Promise.all([
    db.category.findMany({ where: { userId }, select: { id: true, name: true, kind: true } }),
    db.project.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.tag.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const catKey = new Map(exCats.map((c) => [`${c.kind}\u0000${c.name}`, c.id]));
  const projKey = new Map(exProjects.map((p) => [p.name, p.id]));
  const tagKey = new Map(exTags.map((t) => [t.name, t.id]));

  const categories: Prisma.CategoryCreateManyInput[] = [];
  for (const c of d.categories) {
    const k = `${c.kind}\u0000${c.name}`;
    let nid = catKey.get(k);
    if (!nid) {
      nid = newId();
      catKey.set(k, nid);
      categories.push({ id: nid, userId, name: c.name, kind: c.kind, color: c.color ?? "#993399" });
    }
    catMap.set(c.id, nid);
  }
  const projects: Prisma.ProjectCreateManyInput[] = [];
  for (const p of d.projects) {
    let nid = projKey.get(p.name);
    if (!nid) {
      nid = newId();
      projKey.set(p.name, nid);
      projects.push({ id: nid, userId, name: p.name, color: p.color ?? "#993399", archived: p.archived });
    }
    projMap.set(p.id, nid);
  }
  const tags: Prisma.TagCreateManyInput[] = [];
  for (const t of d.tags) {
    let nid = tagKey.get(t.name);
    if (!nid) {
      nid = newId();
      tagKey.set(t.name, nid);
      tags.push({ id: nid, userId, name: t.name });
    }
    tagMap.set(t.id, nid);
  }

  const goals: Prisma.GoalCreateManyInput[] = [];
  const milestones: Prisma.MilestoneCreateManyInput[] = [];
  const progress: Prisma.GoalProgressCreateManyInput[] = [];
  for (const g of d.goals) {
    const gid = newId();
    goalMap.set(g.id, gid);
    const { id: _i, milestones: ms, progressLogs, startDate, createdAt, color: c, ...rest } = g;
    goals.push({ ...rest, id: gid, userId, color: c ?? "#993399", ...(startDate ? { startDate } : {}), ...(createdAt ? { createdAt } : {}) });
    for (const m of ms) {
      const mid = newId();
      msMap.set(m.id, mid);
      const { id: _m, ...mr } = m;
      milestones.push({ ...mr, id: mid, goalId: gid });
    }
    for (const p of progressLogs) progress.push({ goalId: gid, value: p.value, ...(p.createdAt ? { createdAt: p.createdAt } : {}) });
  }

  const events: Prisma.CalendarEventCreateManyInput[] = d.events.map((e) => {
    const eid = newId();
    eventMap.set(e.id, eid);
    const { id: _i, categoryId, ...rest } = e;
    return { ...rest, id: eid, userId, categoryId: ref(catMap, categoryId) };
  });

  const habits: Prisma.HabitCreateManyInput[] = [];
  const entries: Prisma.HabitEntryCreateManyInput[] = [];
  for (const h of d.habits) {
    const hid = newId();
    habitMap.set(h.id, hid);
    const { id: _i, entries: es, createdAt, color: c, ...rest } = h;
    habits.push({ ...rest, id: hid, userId, color: c ?? "#993399", ...(createdAt ? { createdAt } : {}) });
    for (const e of es) entries.push({ habitId: hid, date: e.date, count: e.count });
  }

  for (const t of d.tasks) taskMap.set(t.id, newId());
  const tasks: Prisma.TaskCreateManyInput[] = [];
  const subtasks: Prisma.SubtaskCreateManyInput[] = [];
  const taskTags: Prisma.TaskTagCreateManyInput[] = [];
  for (const t of d.tasks) {
    const tid = taskMap.get(t.id)!;
    const { id: _i, subtasks: st, tagIds, categoryId, projectId, goalId, milestoneId, eventId, createdAt, ...rest } = t;
    tasks.push({
      ...rest,
      id: tid,
      userId,
      categoryId: ref(catMap, categoryId),
      projectId: ref(projMap, projectId),
      goalId: ref(goalMap, goalId),
      milestoneId: ref(msMap, milestoneId),
      eventId: ref(eventMap, eventId),
      ...(createdAt ? { createdAt } : {}),
    });
    for (const s of st) subtasks.push({ ...s, taskId: tid });
    for (const tagId of new Set(tagIds.map((x) => tagMap.get(x)).filter((x): x is string => !!x))) taskTags.push({ taskId: tid, tagId });
  }

  const reminders: Prisma.ReminderCreateManyInput[] = d.reminders.map((r) => {
    const { id: _i, taskId, eventId, habitId, ...rest } = r;
    return { ...rest, id: newId(), userId, taskId: ref(taskMap, taskId), eventId: ref(eventMap, eventId), habitId: ref(habitMap, habitId) };
  });

  const notes: Prisma.NoteCreateManyInput[] = [];
  const noteTags: Prisma.NoteTagCreateManyInput[] = [];
  for (const n of d.notes) {
    const nid = newId();
    const { id: _i, tagIds, categoryId, content, createdAt, ...rest } = n;
    const doc = content && typeof content === "object" ? (content as Prisma.InputJsonValue) : { type: "doc", content: [{ type: "paragraph" }] };
    notes.push({ ...rest, id: nid, userId, content: doc, categoryId: ref(catMap, categoryId), ...(createdAt ? { createdAt } : {}) });
    for (const tagId of new Set(tagIds.map((x) => tagMap.get(x)).filter((x): x is string => !!x))) noteTags.push({ noteId: nid, tagId });
  }

  const vault: Prisma.VaultItemCreateManyInput[] = vaultOk.map((v) => ({
    userId,
    category: v.category,
    title: v.title,
    fieldsEnc: encryptJSON(v.fields),
    deletedAt: v.deletedAt ?? null,
    isDemo: v.isDemo,
  }));

  // ---- Phase 1. Media files aren't in the export: links are kept only to files this account still owns.
  const wantedMedia = new Set<string>([
    ...d.journalEntries.flatMap((j) => j.mediaIds),
    ...d.memories.flatMap((m) => m.mediaIds),
    ...d.timelineEvents.flatMap((t) => t.mediaIds),
    ...d.photos.map((p) => p.mediaId),
    ...d.bucketItems.map((b) => b.imageMediaId).filter((x): x is string => !!x),
    ...d.albums.map((a) => a.coverMediaId).filter((x): x is string => !!x),
  ]);
  const ownedMedia = new Set(
    wantedMedia.size
      ? (await db.mediaFile.findMany({ where: { userId, status: "ready", id: { in: [...wantedMedia] } }, select: { id: true } })).map((m) => m.id)
      : [],
  );
  const own = (mid: string | null | undefined) => (mid && ownedMedia.has(mid) ? mid : null);
  const links = (ids: string[]) => [...new Set(ids)].filter((x) => ownedMedia.has(x));
  let mediaLinksSkipped = 0;
  const countSkipped = (ids: (string | null | undefined)[]) => (mediaLinksSkipped += ids.filter((x) => x && !ownedMedia.has(x)).length);

  const journalMap = map(), albumMap = map(), collectionMap = map();
  const journal: Prisma.JournalEntryCreateManyInput[] = [];
  const journalTags: Prisma.JournalTagCreateManyInput[] = [];
  const journalMedia: Prisma.JournalMediaCreateManyInput[] = [];
  for (const j of d.journalEntries) {
    const jid = newId();
    journalMap.set(j.id, jid);
    const { id: _i, tagIds, mediaIds: mids, content, createdAt, mood: md, ...rest } = j;
    const doc = content && typeof content === "object" ? (content as Prisma.InputJsonValue) : { type: "doc", content: [{ type: "paragraph" }] };
    journal.push({ ...rest, id: jid, userId, content: doc, mood: md ?? null, ...(createdAt ? { createdAt } : {}) });
    for (const tagId of new Set(tagIds.map((x) => tagMap.get(x)).filter((x): x is string => !!x))) journalTags.push({ entryId: jid, tagId });
    countSkipped(mids);
    links(mids).forEach((mediaId, i) => journalMedia.push({ entryId: jid, mediaId, sortOrder: i }));
  }
  const gratitude: Prisma.GratitudeEntryCreateManyInput[] = d.gratitude.map((g) => ({ ...g, userId, items: g.items.slice(0, 3), createdAt: g.createdAt ?? undefined }));
  const moods: Prisma.MoodEntryCreateManyInput[] = d.moods.map(({ journalEntryId, loggedAt, ...m }) => ({ ...m, userId, journalEntryId: ref(journalMap, journalEntryId), ...(loggedAt ? { loggedAt } : {}) }));
  const albums: Prisma.AlbumCreateManyInput[] = d.albums.map(({ id: aid, coverMediaId, createdAt, ...a }) => {
    const nid = newId();
    albumMap.set(aid, nid);
    countSkipped([coverMediaId]);
    return { ...a, id: nid, userId, coverMediaId: own(coverMediaId), ...(createdAt ? { createdAt } : {}) };
  });
  const memories: Prisma.MemoryCreateManyInput[] = [];
  const memoryMedia: Prisma.MemoryMediaCreateManyInput[] = [];
  for (const m of d.memories) {
    const mid = newId();
    const { id: _i, mediaIds: mids, albumId, createdAt, ...rest } = m;
    memories.push({ ...rest, id: mid, userId, albumId: ref(albumMap, albumId), ...(createdAt ? { createdAt } : {}) });
    countSkipped(mids);
    links(mids).forEach((mediaId, i) => memoryMedia.push({ memoryId: mid, mediaId, sortOrder: i }));
  }
  const collections: Prisma.PhotoCollectionCreateManyInput[] = d.photoCollections.map(({ id: cid, createdAt, ...c }) => {
    const nid = newId();
    collectionMap.set(cid, nid);
    return { ...c, id: nid, userId, ...(createdAt ? { createdAt } : {}) };
  });
  // A photo entry is its file: without the file there's nothing to show, so it's skipped.
  const photos: Prisma.PhotoEntryCreateManyInput[] = d.photos
    .filter((p) => (ownedMedia.has(p.mediaId) ? true : (mediaLinksSkipped++, false)))
    .map(({ collectionId, createdAt, ...p }) => ({ ...p, userId, collectionId: ref(collectionMap, collectionId), ...(createdAt ? { createdAt } : {}) }));
  const bucketItems: Prisma.BucketItemCreateManyInput[] = d.bucketItems.map(({ imageMediaId, createdAt, ...b }) => {
    countSkipped([imageMediaId]);
    return { ...b, userId, imageMediaId: own(imageMediaId), ...(createdAt ? { createdAt } : {}) };
  });
  const timeline: Prisma.TimelineEventCreateManyInput[] = [];
  const timelineMedia: Prisma.TimelineMediaCreateManyInput[] = [];
  for (const t of d.timelineEvents) {
    const tid = newId();
    const { mediaIds: mids, createdAt, ...rest } = t;
    timeline.push({ ...rest, id: tid, userId, ...(createdAt ? { createdAt } : {}) });
    countSkipped(mids);
    links(mids).forEach((mediaId, i) => timelineMedia.push({ eventId: tid, mediaId, sortOrder: i }));
  }
  const reviews: Prisma.WeeklyReviewCreateManyInput[] = d.weeklyReviews.map((r) => ({ ...r, userId }));

  await db.$transaction(
    [
      db.category.createMany({ data: categories }),
      db.project.createMany({ data: projects }),
      db.tag.createMany({ data: tags }),
      db.goal.createMany({ data: goals }),
      db.milestone.createMany({ data: milestones }),
      db.goalProgress.createMany({ data: progress }),
      db.calendarEvent.createMany({ data: events }),
      db.habit.createMany({ data: habits }),
      db.habitEntry.createMany({ data: entries, skipDuplicates: true }),
      db.task.createMany({ data: tasks }),
      db.subtask.createMany({ data: subtasks }),
      db.taskTag.createMany({ data: taskTags, skipDuplicates: true }),
      db.reminder.createMany({ data: reminders }),
      db.note.createMany({ data: notes }),
      db.noteTag.createMany({ data: noteTags, skipDuplicates: true }),
      db.vaultItem.createMany({ data: vault }),
      db.journalEntry.createMany({ data: journal }),
      db.journalTag.createMany({ data: journalTags, skipDuplicates: true }),
      db.journalMedia.createMany({ data: journalMedia, skipDuplicates: true }),
      db.gratitudeEntry.createMany({ data: gratitude, skipDuplicates: true }),
      db.moodEntry.createMany({ data: moods }),
      db.album.createMany({ data: albums }),
      db.memory.createMany({ data: memories }),
      db.memoryMedia.createMany({ data: memoryMedia, skipDuplicates: true }),
      db.photoCollection.createMany({ data: collections }),
      db.photoEntry.createMany({ data: photos }),
      db.bucketItem.createMany({ data: bucketItems }),
      db.timelineEvent.createMany({ data: timeline }),
      db.timelineMedia.createMany({ data: timelineMedia, skipDuplicates: true }),
      db.weeklyReview.createMany({ data: reviews, skipDuplicates: true }),
    ],
  );

  return { imported: true, summary: { ...summary, mediaLinksSkipped } };
});
