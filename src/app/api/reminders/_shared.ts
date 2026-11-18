import "server-only";
import type { NextRequest } from "next/server";
import type { Reminder } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, notFound, tzOf } from "@/lib/api";
import { isValidTz, zonedToUtc } from "@/lib/time";

export const KINDS = ["water", "break", "meeting", "bill", "family", "deadline", "routine", "custom"] as const;
export const RECURRENCES = ["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as const;

/** The user's timezone: settings first (unless left at UTC), else the x-tz header. */
export async function userTz(req: NextRequest, userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
  if (s?.timezone && s.timezone !== "UTC" && isValidTz(s.timezone)) return s.timezone;
  return tzOf(req);
}

export async function findReminder(userId: string, id: string) {
  const r = await db.reminder.findFirst({ where: { id, userId } });
  if (!r) throw notFound("Reminder");
  return r;
}

const isoDate = z.string().datetime({ offset: true }).or(z.string().datetime());
const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}$/);

export const reminderFields = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().max(2000).nullish(),
  kind: z.enum(KINDS).default("custom"),
  /** Absolute instant (ISO). Alternatively send date + time in the user's timezone. */
  remindAt: isoDate.optional(),
  date: dayStr.optional(),
  time: timeStr.optional(),
  recurrence: z.enum(RECURRENCES).default("NONE"),
  intervalMinutes: z.number().int().min(5).max(60 * 24 * 30).nullish(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  endsAt: isoDate.nullish(),
  taskId: z.string().nullish(),
  habitId: z.string().nullish(),
  eventId: z.string().nullish(),
});

export function resolveRemindAt(input: { remindAt?: string; date?: string; time?: string }, tz: string): Date | undefined {
  if (input.remindAt) return new Date(input.remindAt);
  if (input.date) return zonedToUtc(input.date, input.time ?? "09:00", tz);
  return undefined;
}

export function validateRecurrence(r: { recurrence: string; intervalMinutes?: number | null; daysOfWeek?: number[] }) {
  if (r.recurrence === "HOURLY" && !r.intervalMinutes) throw new ApiError(400, "intervalMinutes is required for an interval reminder");
  if (r.recurrence === "CUSTOM" && !r.intervalMinutes && !r.daysOfWeek?.length)
    throw new ApiError(400, "A custom repeat needs an interval or at least one weekday");
}

/** Ensures linked task / habit / event ids belong to the user. */
export async function assertLinks(userId: string, l: { taskId?: string | null; habitId?: string | null; eventId?: string | null }) {
  if (l.taskId && !(await db.task.findFirst({ where: { id: l.taskId, userId }, select: { id: true } }))) throw notFound("Task");
  if (l.habitId && !(await db.habit.findFirst({ where: { id: l.habitId, userId }, select: { id: true } }))) throw notFound("Habit");
  if (l.eventId && !(await db.calendarEvent.findFirst({ where: { id: l.eventId, userId }, select: { id: true } }))) throw notFound("Event");
}

/** Adds small link summaries (task / habit / event titles) to reminder rows. */
export async function withLinks(userId: string, rows: Reminder[]) {
  const ids = (k: "taskId" | "habitId" | "eventId") => [...new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))];
  const [tasks, habits, events] = await Promise.all([
    ids("taskId").length ? db.task.findMany({ where: { userId, id: { in: ids("taskId") } }, select: { id: true, title: true, deletedAt: true } }) : [],
    ids("habitId").length ? db.habit.findMany({ where: { userId, id: { in: ids("habitId") } }, select: { id: true, name: true, deletedAt: true } }) : [],
    ids("eventId").length ? db.calendarEvent.findMany({ where: { userId, id: { in: ids("eventId") } }, select: { id: true, title: true, start: true, deletedAt: true } }) : [],
  ]);
  const t = new Map(tasks.filter((x) => !x.deletedAt).map((x) => [x.id, { id: x.id, title: x.title }]));
  const h = new Map(habits.filter((x) => !x.deletedAt).map((x) => [x.id, { id: x.id, name: x.name }]));
  const e = new Map(events.filter((x) => !x.deletedAt).map((x) => [x.id, { id: x.id, title: x.title, start: x.start }]));
  return rows.map((r) => ({
    ...r,
    task: r.taskId ? (t.get(r.taskId) ?? null) : null,
    habit: r.habitId ? (h.get(r.habitId) ?? null) : null,
    event: r.eventId ? (e.get(r.eventId) ?? null) : null,
  }));
}
