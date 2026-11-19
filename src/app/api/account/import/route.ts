import { randomUUID } from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, query, route } from "@/lib/api";
import { encryptJSON } from "@/lib/crypto";
import { VAULT_CATEGORIES, vaultProblem } from "@/components/vault/guard";

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
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).catch("#635BFF");
const flag = z.boolean().default(false);

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
      categories.push({ id: nid, userId, name: c.name, kind: c.kind, color: c.color ?? "#635BFF" });
    }
    catMap.set(c.id, nid);
  }
  const projects: Prisma.ProjectCreateManyInput[] = [];
  for (const p of d.projects) {
    let nid = projKey.get(p.name);
    if (!nid) {
      nid = newId();
      projKey.set(p.name, nid);
      projects.push({ id: nid, userId, name: p.name, color: p.color ?? "#635BFF", archived: p.archived });
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
    goals.push({ ...rest, id: gid, userId, color: c ?? "#635BFF", ...(startDate ? { startDate } : {}), ...(createdAt ? { createdAt } : {}) });
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
    habits.push({ ...rest, id: hid, userId, color: c ?? "#635BFF", ...(createdAt ? { createdAt } : {}) });
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
    ],
  );

  return { imported: true, summary };
});
