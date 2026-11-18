import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { Prisma, Task, TaskStatus } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "./api";
import { nextOccurrence } from "./recurrence";
import { dayRange, addDaysKey, zonedToUtc } from "./time";

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export const taskInclude = {
  category: { select: { id: true, name: true, color: true } },
  project: { select: { id: true, name: true, color: true } },
  goal: { select: { id: true, title: true, color: true } },
  milestone: { select: { id: true, title: true } },
  event: { select: { id: true, title: true, start: true, end: true } },
  subtasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  attachments: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function serializeTask(t: TaskWithRelations) {
  const { tags, ...rest } = t;
  return {
    ...rest,
    tags: tags.map((x) => x.tag),
    subtaskCount: t.subtasks.length,
    subtaskDone: t.subtasks.filter((s) => s.done).length,
    attachmentCount: t.attachments.length,
  };
}
export type SerializedTask = ReturnType<typeof serializeTask>;

export async function getTask(userId: string, id: string) {
  const t = await db.task.findFirst({ where: { id, userId }, include: taskInclude });
  if (!t) throw new ApiError(404, "Task not found");
  return t;
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:mm")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const optId = z.string().min(1).max(64).nullable().optional().or(z.literal("").transform(() => null));
/** ISO instant, or a plain yyyy-MM-dd day (converted in the caller's timezone). */
const dateish = z.string().max(40).nullable().optional().or(z.literal("").transform(() => null));

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TASK_RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export const subtaskInput = z.object({
  id: z.string().max(64).optional(),
  title: z.string().trim().min(1).max(300),
  done: z.boolean().optional().default(false),
});

export const taskFields = {
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().max(10000).nullable().optional(),
  dueDate: dateish,
  startTime: hhmm,
  endTime: hhmm,
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  categoryId: optId,
  projectId: optId,
  goalId: optId,
  milestoneId: optId,
  eventId: optId,
  recurrence: z.enum(["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"]).optional(),
  recurrenceRule: z.string().max(200).nullable().optional(),
  reminderAt: dateish,
  focusRank: z.number().int().min(1).max(3).nullable().optional(),
  sortOrder: z.number().finite().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  subtasks: z.array(subtaskInput).max(100).optional(),
};

export const createTaskSchema = z.object(taskFields);
export const patchTaskSchema = z
  .object({
    ...taskFields,
    title: taskFields.title.optional(),
    deletedAt: z.null().optional(),
    archived: z.boolean().optional(),
  });

export type TaskInput = z.input<typeof patchTaskSchema>;

function parseDateish(v: string | null | undefined, tz: string, time = "23:59"): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? zonedToUtc(v, time, tz) : new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid date: ${v}`);
  return d;
}

/** HH:mm of an instant in tz. */
export function timeOfDay(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Throws 400 when a referenced row doesn't belong to the user. */
async function assertOwned(userId: string, input: TaskInput) {
  const checks: Promise<void>[] = [];
  const check = (label: string, p: Promise<unknown>) =>
    checks.push(
      p.then((r) => {
        if (!r) throw new ApiError(400, `${label} not found`);
      }),
    );
  if (input.categoryId) check("Category", db.category.findFirst({ where: { id: input.categoryId, userId }, select: { id: true } }));
  if (input.projectId) check("Project", db.project.findFirst({ where: { id: input.projectId, userId }, select: { id: true } }));
  if (input.goalId) check("Goal", db.goal.findFirst({ where: { id: input.goalId, userId }, select: { id: true } }));
  if (input.milestoneId)
    check("Milestone", db.milestone.findFirst({ where: { id: input.milestoneId, goal: { userId } }, select: { id: true } }));
  if (input.eventId) check("Event", db.calendarEvent.findFirst({ where: { id: input.eventId, userId }, select: { id: true } }));
  await Promise.all(checks);
}

/** Scalar column updates from validated input (relations handled separately). */
export async function buildTaskData(
  userId: string,
  input: TaskInput,
  tz: string,
  current?: Pick<Task, "dueDate" | "startTime" | "endTime"> | null,
): Promise<Prisma.TaskUncheckedUpdateInput> {
  await assertOwned(userId, input);
  const data: Prisma.TaskUncheckedUpdateInput = {};
  const keys = [
    "title",
    "description",
    "startTime",
    "endTime",
    "priority",
    "categoryId",
    "projectId",
    "goalId",
    "milestoneId",
    "eventId",
    "recurrence",
    "recurrenceRule",
    "focusRank",
    "sortOrder",
  ] as const;
  for (const k of keys) if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  if (input.description !== undefined) data.description = input.description?.trim() ? input.description : null;
  // A day-only due date takes the task's time (end, start, or previous time-of-day).
  const endT = input.endTime !== undefined ? input.endTime : current?.endTime;
  const startT = input.startTime !== undefined ? input.startTime : current?.startTime;
  const dueTime = endT || startT || (current?.dueDate ? timeOfDay(current.dueDate, tz) : "23:59");
  const due = parseDateish(input.dueDate, tz, dueTime);
  if (due !== undefined) data.dueDate = due;
  const rem = parseDateish(input.reminderAt, tz, "09:00");
  if (rem !== undefined) data.reminderAt = rem;
  if (input.goalId === null) data.milestoneId = null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.deletedAt === null) data.deletedAt = null;
  return data;
}

export async function setTaskTags(userId: string, taskId: string, names: string[]) {
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n.trim()])).values()].filter(Boolean);
  const tags = await Promise.all(
    unique.map((name) =>
      db.tag.upsert({ where: { userId_name: { userId, name } }, update: {}, create: { userId, name }, select: { id: true } }),
    ),
  );
  await db.$transaction([
    db.taskTag.deleteMany({ where: { taskId, tagId: { notIn: tags.map((t) => t.id) } } }),
    ...tags.map((t) =>
      db.taskTag.upsert({ where: { taskId_tagId: { taskId, tagId: t.id } }, update: {}, create: { taskId, tagId: t.id } }),
    ),
  ]);
}

/** Replace the subtask list with the given ordered array (keeps ids that still exist). */
export async function setSubtasks(taskId: string, items: z.input<typeof subtaskInput>[]) {
  const existing = await db.subtask.findMany({ where: { taskId }, select: { id: true } });
  const ids = new Set(existing.map((s) => s.id));
  const keep = items.filter((s) => s.id && ids.has(s.id)).map((s) => s.id!);
  await db.$transaction([
    db.subtask.deleteMany({ where: { taskId, id: { notIn: keep } } }),
    ...items.map((s, i) =>
      s.id && ids.has(s.id)
        ? db.subtask.update({ where: { id: s.id }, data: { title: s.title, done: !!s.done, sortOrder: i } })
        : db.subtask.create({ data: { taskId, title: s.title, done: !!s.done, sortOrder: i } }),
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/* Linked reminder                                                     */
/* ------------------------------------------------------------------ */

/** Keep exactly one Reminder row (taskId = task.id) in step with task.reminderAt. */
export async function syncTaskReminder(task: Pick<Task, "id" | "userId" | "title" | "reminderAt" | "status" | "deletedAt" | "archivedAt" | "isDemo">) {
  const existing = await db.reminder.findFirst({ where: { userId: task.userId, taskId: task.id }, orderBy: { createdAt: "asc" } });
  const done = task.status === "COMPLETED" || task.status === "CANCELLED";
  if (!task.reminderAt) {
    if (existing) await db.reminder.deleteMany({ where: { userId: task.userId, taskId: task.id } });
    return;
  }
  const data = {
    title: task.title,
    remindAt: task.reminderAt,
    kind: "deadline",
    status: done ? ("COMPLETED" as const) : ("ACTIVE" as const),
    deletedAt: task.deletedAt,
    archivedAt: task.archivedAt,
    snoozedUntil: null,
  };
  if (existing) {
    const changedTime = existing.remindAt.getTime() !== task.reminderAt.getTime();
    await db.reminder.update({
      where: { id: existing.id },
      data: { ...data, ...(changedTime ? { lastFiredAt: null } : { snoozedUntil: existing.snoozedUntil }) },
    });
  } else {
    await db.reminder.create({ data: { ...data, userId: task.userId, taskId: task.id, isDemo: task.isDemo } });
  }
}

/* ------------------------------------------------------------------ */
/* Status / completion                                                 */
/* ------------------------------------------------------------------ */

/**
 * Change a task's status. Completing a recurring task creates the next
 * occurrence (returned as `next`) and turns the completed copy into a
 * one-off so re-completing it never spawns duplicates.
 */
export async function setTaskStatus(userId: string, id: string, status: TaskStatus) {
  const task = await getTask(userId, id);
  if (status === "COMPLETED") return completeTask(userId, task);
  const updated = await db.task.update({
    where: { id },
    data: { status, completedAt: null },
  });
  await syncTaskReminder(updated);
  return { task: updated, next: null as Task | null };
}

export async function completeTask(userId: string, task: TaskWithRelations) {
  if (task.status === "COMPLETED") return { task: task as Task, next: null as Task | null };
  const now = new Date();
  let next: Task | null = null;
  const recurring = task.recurrence !== "NONE" && task.recurrence !== "HOURLY" && task.recurrence !== "CUSTOM";
  if (recurring) {
    const anchor = task.dueDate ?? now;
    const after = new Date(Math.max(anchor.getTime(), now.getTime()));
    const nextDue = nextOccurrence(anchor, { recurrence: task.recurrence }, after);
    if (nextDue) {
      const delta = nextDue.getTime() - anchor.getTime();
      next = await db.task.create({
        data: {
          userId,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate ? nextDue : null,
          startTime: task.startTime,
          endTime: task.endTime,
          priority: task.priority,
          categoryId: task.categoryId,
          projectId: task.projectId,
          goalId: task.goalId,
          milestoneId: task.milestoneId,
          recurrence: task.recurrence,
          recurrenceRule: task.recurrenceRule,
          reminderAt: task.reminderAt ? new Date(task.reminderAt.getTime() + delta) : null,
          sortOrder: task.sortOrder,
          isDemo: task.isDemo,
          subtasks: { create: task.subtasks.map((s, i) => ({ title: s.title, sortOrder: i })) },
          tags: { create: task.tags.map((t) => ({ tagId: t.tagId })) },
        },
      });
      await syncTaskReminder(next);
    }
  }
  const updated = await db.task.update({
    where: { id: task.id },
    data: { status: "COMPLETED", completedAt: now, ...(next ? { recurrence: "NONE" } : {}) },
  });
  await syncTaskReminder(updated);
  return { task: updated, next };
}

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

export const OPEN: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS"];

export function smartWhere(view: string, tz: string): Prisma.TaskWhereInput {
  const [todayStart, todayEnd] = dayRange(new Date(), tz);
  switch (view) {
    case "active":
      return { status: { in: OPEN } };
    case "today":
      return { dueDate: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } };
    case "upcoming":
      return { dueDate: { gte: todayEnd }, status: { in: OPEN } };
    case "overdue":
      return { dueDate: { lt: todayStart }, status: { in: OPEN } };
    case "completed":
      return { status: "COMPLETED" };
    default:
      return {};
  }
}

export async function smartCounts(userId: string, tz: string) {
  const base: Prisma.TaskWhereInput = { userId, deletedAt: null, archivedAt: null };
  const [todayStart, todayEnd] = dayRange(new Date(), tz);
  const [all, today, upcoming, overdue, completed] = await Promise.all([
    db.task.count({ where: { ...base, status: { in: OPEN } } }),
    db.task.count({ where: { ...base, status: { in: OPEN }, dueDate: { gte: todayStart, lt: todayEnd } } }),
    db.task.count({ where: { ...base, ...smartWhere("upcoming", tz) } }),
    db.task.count({ where: { ...base, ...smartWhere("overdue", tz) } }),
    db.task.count({ where: { ...base, status: "COMPLETED" } }),
  ]);
  return { all, today, upcoming, overdue, completed };
}

/** yyyy-MM-dd → start of that day in tz; ISO passes through. */
export function parseBound(v: string | null, tz: string, end = false): Date | undefined {
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return zonedToUtc(end ? addDaysKey(v, 1) : v, "00:00", tz);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");
}

/** Absolute path for a storage key, refusing anything that escapes the root. */
export function storagePath(key: string) {
  const root = storageRoot();
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new ApiError(400, "Invalid storage key");
  return p;
}

export async function removeFiles(keys: string[]) {
  await Promise.all(keys.map((k) => fs.unlink(storagePath(k)).catch(() => undefined)));
}

/** Hard-delete tasks (and their files + linked reminders). */
export async function purgeTasks(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const owned = await db.task.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
  const ownedIds = owned.map((t) => t.id);
  const files = await db.attachment.findMany({ where: { userId, taskId: { in: ownedIds } }, select: { storageKey: true } });
  await db.$transaction([
    db.reminder.deleteMany({ where: { userId, taskId: { in: ownedIds } } }),
    db.task.deleteMany({ where: { userId, id: { in: ownedIds } } }),
  ]);
  await removeFiles(files.map((f) => f.storageKey));
  return ownedIds.length;
}

/** Mirror soft-delete / archive onto the linked reminder so it stops firing. */
export async function mirrorReminderVisibility(userId: string, taskIds: string[], data: { deletedAt?: Date | null; archivedAt?: Date | null }) {
  if (!taskIds.length) return;
  await db.reminder.updateMany({ where: { userId, taskId: { in: taskIds } }, data });
}
