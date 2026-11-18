import "server-only";
import { z } from "zod";
import type { Habit, HabitEntry } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { notFound } from "@/lib/api";
import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";
import { habitStats, isScheduled } from "@/lib/habits";

export const HABIT_ICON_NAMES = [
  "check", "dumbbell", "book-open", "brain", "glass-water", "moon", "sun", "footprints", "bike", "apple",
  "heart", "pill", "pen-line", "music", "code", "leaf", "coffee", "piggy-bank", "phone-off", "bed",
] as const;

export const habitFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(2000).nullable().optional(),
  icon: z.enum(HABIT_ICON_NAMES).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color").optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  targetPerDay: z.number().int().min(1).max(100).optional(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
    .nullable()
    .optional(),
};

/** Normalise schedule: daily ⇒ all days; weekly needs at least one day. */
export function normaliseSchedule<T extends { frequency?: string; daysOfWeek?: number[] }>(input: T, current?: Pick<Habit, "frequency" | "daysOfWeek">): T {
  const frequency = input.frequency ?? current?.frequency ?? "daily";
  let days = input.daysOfWeek ?? current?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  days = [...new Set(days)].sort((a, b) => a - b);
  if (frequency === "daily" || days.length === 0) days = [0, 1, 2, 3, 4, 5, 6];
  return { ...input, frequency: days.length === 7 ? "daily" : frequency, daysOfWeek: days };
}

export async function findHabit(userId: string, id: string) {
  const habit = await db.habit.findFirst({ where: { id, userId } });
  if (!habit) throw notFound("Habit");
  return habit;
}

/** The next time the habit's reminder should fire (strictly in the future). */
export function nextHabitReminder(habit: Pick<Habit, "frequency" | "daysOfWeek" | "reminderTime">, tz: string, now = new Date()): Date | null {
  if (!habit.reminderTime) return null;
  const today = dayKey(now, tz);
  for (let i = 0; i <= 8; i++) {
    const k = addDaysKey(today, i);
    if (!isScheduled(habit, k)) continue;
    const at = zonedToUtc(k, habit.reminderTime, tz);
    if (at > now) return at;
  }
  return null;
}

/**
 * Keeps the habit's linked Reminder in sync: present (and up to date) while
 * the habit is live and has a reminder time; removed otherwise. The reminder
 * module fires and reschedules it.
 */
export async function syncHabitReminder(habit: Habit, tz: string) {
  const existing = await db.reminder.findMany({ where: { userId: habit.userId, habitId: habit.id } });
  const live = !habit.deletedAt && !habit.archivedAt && !!habit.reminderTime;
  const remindAt = live ? nextHabitReminder(habit, tz) : null;
  if (!live || !remindAt) {
    if (existing.length) await db.reminder.deleteMany({ where: { userId: habit.userId, habitId: habit.id } });
    return null;
  }
  const everyDay = habit.frequency !== "weekly" || habit.daysOfWeek.length === 7;
  const data = {
    title: habit.name,
    notes: habit.description ?? null,
    kind: "routine",
    remindAt,
    recurrence: everyDay ? ("DAILY" as const) : ("WEEKLY" as const),
    daysOfWeek: everyDay ? [] : habit.daysOfWeek,
    status: "ACTIVE" as const,
    snoozedUntil: null,
    archivedAt: null,
    deletedAt: null,
    isDemo: habit.isDemo,
  };
  const [first, ...extra] = existing;
  if (extra.length) await db.reminder.deleteMany({ where: { id: { in: extra.map((r) => r.id) } } });
  if (first) return db.reminder.update({ where: { id: first.id }, data });
  return db.reminder.create({ data: { ...data, userId: habit.userId, habitId: habit.id } });
}

export const ENTRY_WINDOW_DAYS = 140;

/** Habit + computed stats, as returned by list/detail endpoints. */
export function serializeHabit(habit: Habit, entries: Pick<HabitEntry, "date" | "count">[], tz: string, todayKey: string, window = ENTRY_WINDOW_DAYS) {
  const startKey = (() => {
    let s = dayKey(habit.createdAt, tz);
    for (const e of entries) if (e.date < s) s = e.date;
    return s > todayKey ? todayKey : s;
  })();
  const stats = habitStats(entries, habit, todayKey, { startKey });
  const from = addDaysKey(todayKey, -(window - 1));
  return {
    ...habit,
    ...stats,
    todayKey,
    entries: entries.filter((e) => e.date >= from && e.date <= todayKey).map((e) => ({ date: e.date, count: e.count })),
  };
}

export { weekdayOfKey };

/** notify() that never fails the request (web push errors are logged, the in-app row is still written). */
export async function safeNotify(...args: Parameters<typeof notify>) {
  try {
    return await notify(...args);
  } catch (err) {
    console.error("notify failed", err);
    return null;
  }
}
