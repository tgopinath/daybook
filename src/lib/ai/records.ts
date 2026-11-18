import "server-only";
import type { Prisma, Priority, Recurrence, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api";
import { nextOccurrence, nextOccurrenceTz } from "@/lib/recurrence";
import { addDaysKey, dayKey, zonedToUtc } from "@/lib/time";

// User-scoped record creation shared by AI tools and Quick Capture save.
// Inputs are already validated with Zod by the caller.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DT_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** "yyyy-MM-dd", "yyyy-MM-ddTHH:mm" (wall time in tz) or a full ISO instant with offset. */
export function parseLocalDateTime(v: string, tz: string, defaultTime = "00:00"): Date {
  let d: Date;
  if (DAY_RE.test(v)) d = zonedToUtc(v, defaultTime, tz);
  else {
    const m = LOCAL_DT_RE.exec(v);
    d = m ? zonedToUtc(m[1]!, m[2]!, tz) : new Date(v);
  }
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid date: ${v}`);
  return d;
}

export async function resolveCategory(userId: string, name?: string | null): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const existing = await db.category.findFirst({ where: { userId, name: { equals: n, mode: "insensitive" } }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.category.upsert({
    where: { userId_name_kind: { userId, name: n, kind: "general" } },
    update: {},
    create: { userId, name: n, kind: "general" },
    select: { id: true },
  });
  return created.id;
}

async function assertGoal(userId: string, goalId?: string | null, milestoneId?: string | null) {
  if (goalId && !(await db.goal.findFirst({ where: { id: goalId, userId, deletedAt: null }, select: { id: true } }))) throw notFound("Goal");
  if (milestoneId && !(await db.milestone.findFirst({ where: { id: milestoneId, goal: { userId } }, select: { id: true } }))) throw notFound("Milestone");
}

/* ---------------- Tasks ---------------- */

export interface TaskCreate {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  priority?: Priority | null;
  goalId?: string | null;
  milestoneId?: string | null;
  categoryName?: string | null;
  recurrence?: Recurrence | null;
}

function taskDue(dueDate: string | null | undefined, startTime: string | null | undefined, endTime: string | null | undefined, tz: string): Date | null {
  if (!dueDate) return null;
  // Same convention as the tasks module: a date-only due date lands at the end/start time, else 23:59.
  return parseLocalDateTime(dueDate, tz, endTime || startTime || "23:59");
}

export async function createTask(userId: string, tz: string, input: TaskCreate) {
  await assertGoal(userId, input.goalId, input.milestoneId);
  const categoryId = await resolveCategory(userId, input.categoryName);
  const settings = await db.userSettings.findUnique({ where: { userId }, select: { defaultPriority: true } });
  return db.task.create({
    data: {
      userId,
      title: input.title.trim(),
      description: input.description || null,
      dueDate: taskDue(input.dueDate, input.startTime, input.endTime, tz),
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      priority: input.priority ?? settings?.defaultPriority ?? "MEDIUM",
      goalId: input.goalId || null,
      milestoneId: input.milestoneId || null,
      categoryId,
      recurrence: input.recurrence ?? "NONE",
    },
  });
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  priority?: Priority;
  status?: TaskStatus;
}

export async function updateTask(userId: string, tz: string, id: string, patch: TaskPatch) {
  const task = await db.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!task) throw notFound("Task");
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.startTime !== undefined) data.startTime = patch.startTime;
  if (patch.endTime !== undefined) data.endTime = patch.endTime;
  if (patch.dueDate !== undefined) {
    const start = patch.startTime !== undefined ? patch.startTime : task.startTime;
    const end = patch.endTime !== undefined ? patch.endTime : task.endTime;
    data.dueDate = taskDue(patch.dueDate, start, end, tz);
  } else if ((patch.startTime || patch.endTime) && task.dueDate) {
    // Times changed on a dated task: keep the day, move the instant.
    data.dueDate = taskDue(dayKey(task.dueDate, tz), patch.startTime ?? task.startTime, patch.endTime ?? task.endTime, tz);
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    if (patch.status === "COMPLETED") return completeTask(userId, id, data);
    data.status = patch.status;
    data.completedAt = null;
  }
  return db.task.update({ where: { id: task.id }, data });
}

/** Marks a task done; recurring tasks spawn their next occurrence. */
export async function completeTask(userId: string, id: string, extra: Record<string, unknown> = {}) {
  const task = await db.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!task) throw notFound("Task");
  if (task.status === "COMPLETED") return task;
  const now = new Date();
  const updated = await db.task.update({ where: { id: task.id }, data: { ...extra, status: "COMPLETED", completedAt: now } });
  if (task.recurrence !== "NONE" && task.dueDate) {
    const next = nextOccurrence(task.dueDate, { recurrence: task.recurrence }, task.dueDate);
    if (next) {
      await db.task.create({
        data: {
          userId,
          title: task.title,
          description: task.description,
          dueDate: next,
          startTime: task.startTime,
          endTime: task.endTime,
          priority: task.priority,
          categoryId: task.categoryId,
          projectId: task.projectId,
          goalId: task.goalId,
          milestoneId: task.milestoneId,
          recurrence: task.recurrence,
          recurrenceRule: task.recurrenceRule,
        },
      });
    }
  }
  return updated;
}

/* ---------------- Reminders ---------------- */

export interface ReminderCreate {
  title: string;
  kind?: string | null;
  remindAt?: string | null;
  recurrence?: Recurrence | null;
  intervalMinutes?: number | null;
  daysOfWeek?: number[] | null;
  notes?: string | null;
}

export async function createReminder(userId: string, tz: string, input: ReminderCreate, now = new Date()) {
  const recurrence = input.recurrence ?? "NONE";
  const intervalMinutes = recurrence === "HOURLY" ? input.intervalMinutes || 60 : input.intervalMinutes ?? null;
  let remindAt: Date;
  if (input.remindAt) remindAt = parseLocalDateTime(input.remindAt, tz, "09:00");
  else if (recurrence === "HOURLY") remindAt = new Date(now.getTime() + intervalMinutes! * 60000);
  else {
    // Next full hour.
    remindAt = new Date(now);
    remindAt.setUTCMinutes(0, 0, 0);
    remindAt = new Date(remindAt.getTime() + 3600_000);
  }
  const daysOfWeek = input.daysOfWeek ?? [];
  if (remindAt <= now) {
    if (recurrence === "NONE") throw new ApiError(400, "That reminder time has already passed — pick a later time");
    const next = nextOccurrenceTz(remindAt, { recurrence, intervalMinutes, daysOfWeek }, now, tz);
    if (!next) throw new ApiError(400, "Couldn't compute the next reminder time");
    remindAt = next;
  }
  return db.reminder.create({
    data: {
      userId,
      title: input.title.trim(),
      notes: input.notes || null,
      kind: input.kind || guessReminderKind(input.title),
      remindAt,
      recurrence,
      intervalMinutes,
      daysOfWeek,
    },
  });
}

function guessReminderKind(title: string) {
  const t = title.toLowerCase();
  if (/water|drink/.test(t)) return "water";
  if (/break|stretch|walk/.test(t)) return "break";
  if (/meeting|call|standup|sync/.test(t)) return "meeting";
  if (/bill|pay|rent|invoice/.test(t)) return "bill";
  if (/mom|dad|family|birthday/.test(t)) return "family";
  if (/deadline|due|submit/.test(t)) return "deadline";
  return "custom";
}

/* ---------------- Events ---------------- */

export interface EventCreate {
  title: string;
  start: string;
  end?: string | null;
  allDay?: boolean | null;
  kind?: string | null;
  description?: string | null;
  location?: string | null;
  categoryName?: string | null;
  recurrence?: Recurrence | null;
}

export async function createEvent(userId: string, tz: string, input: EventCreate) {
  const categoryId = await resolveCategory(userId, input.categoryName);
  let start: Date;
  let end: Date;
  if (input.allDay) {
    const day = DAY_RE.test(input.start) ? input.start : dayKey(parseLocalDateTime(input.start, tz), tz);
    const endDay = input.end ? (DAY_RE.test(input.end) ? input.end : dayKey(parseLocalDateTime(input.end, tz), tz)) : day;
    start = zonedToUtc(day, "00:00", tz);
    end = zonedToUtc(addDaysKey(endDay >= day ? endDay : day, 1), "00:00", tz);
  } else {
    start = parseLocalDateTime(input.start, tz, "09:00");
    end = input.end ? parseLocalDateTime(input.end, tz, "10:00") : new Date(start.getTime() + 3600_000);
    if (end <= start) end = new Date(start.getTime() + 3600_000);
  }
  return db.calendarEvent.create({
    data: {
      userId,
      title: input.title.trim(),
      description: input.description || null,
      location: input.location || null,
      start,
      end,
      allDay: !!input.allDay,
      kind: input.kind || "event",
      categoryId,
      recurrence: input.recurrence ?? "NONE",
    },
  });
}

/* ---------------- Habits ---------------- */

export async function createHabit(userId: string, input: { name: string; daysOfWeek?: number[] | null; reminderTime?: string | null; description?: string | null }) {
  const days = input.daysOfWeek?.length ? input.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  return db.habit.create({
    data: {
      userId,
      name: input.name.trim(),
      description: input.description || null,
      frequency: days.length === 7 ? "daily" : "weekly",
      daysOfWeek: days,
      reminderTime: input.reminderTime || null,
    },
  });
}

/* ---------------- Notes ---------------- */

export function textToTiptap(text: string) {
  const blocks: Record<string, unknown>[] = [];
  let list: Record<string, unknown>[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) {
        list = [];
        blocks.push({ type: "bulletList", content: list });
      }
      list.push({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: bullet[1] }] }] });
      continue;
    }
    list = null;
    blocks.push(line.trim() ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" });
  }
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}

export async function createNote(userId: string, input: { title: string; text?: string | null; categoryName?: string | null }) {
  const categoryId = await resolveCategory(userId, input.categoryName);
  const text = input.text ?? "";
  return db.note.create({
    data: {
      userId,
      title: input.title.trim() || "Untitled",
      content: textToTiptap(text) as Prisma.InputJsonValue,
      plainText: text,
      categoryId,
    },
  });
}

/* ---------------- Undo ---------------- */

export type RecordKind = "task" | "reminder" | "event" | "habit" | "note";

/** Soft-deletes a record this user owns (Undo after Quick Capture). */
export async function softDeleteRecord(userId: string, kind: RecordKind, id: string) {
  const where = { id, userId };
  const data = { deletedAt: new Date() };
  const res =
    kind === "task"
      ? await db.task.updateMany({ where, data })
      : kind === "reminder"
        ? await db.reminder.updateMany({ where, data })
        : kind === "event"
          ? await db.calendarEvent.updateMany({ where, data })
          : kind === "habit"
            ? await db.habit.updateMany({ where, data })
            : await db.note.updateMany({ where, data });
  if (!res.count) throw notFound(kind[0]!.toUpperCase() + kind.slice(1));
}
