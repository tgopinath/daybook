import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { findHabit, serializeHabit, safeNotify } from "../../_shared";

type P = { id: string };

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd")
    .optional(),
  delta: z.union([z.literal(1), z.literal(-1)]).optional(),
});

const STREAK_MILESTONES = [7, 30, 50, 100, 200, 365];

/**
 * Check in for a day (default: today in the caller's timezone).
 * Without delta: toggles done (sets count to the target, or clears it).
 * delta ±1: increments/decrements the day's count (count-based habits).
 */
export const POST = route<P>(async ({ req, user, params }) => {
  const habit = await findHabit(user.id, params.id);
  const { date, delta } = await body(req, schema);
  const tz = tzOf(req);
  const todayKey = dayKey(new Date(), tz);
  const key = date ?? todayKey;
  if (key > todayKey) throw new ApiError(400, "You can't check in for a future day");
  if (key < "2000-01-01") throw new ApiError(400, "Date is too far in the past");

  const target = Math.max(1, habit.targetPerDay);
  const entry = await db.habitEntry.findUnique({ where: { habitId_date: { habitId: habit.id, date: key } } });
  const current = entry?.count ?? 0;
  let next: number;
  if (delta === undefined) next = current >= target ? 0 : target;
  else next = Math.max(0, Math.min(Math.max(target * 2, target + 10), current + delta));

  if (next === 0) {
    if (entry) await db.habitEntry.delete({ where: { id: entry.id } });
  } else {
    await db.habitEntry.upsert({
      where: { habitId_date: { habitId: habit.id, date: key } },
      create: { habitId: habit.id, date: key, count: next },
      update: { count: next },
    });
  }
  await db.habit.update({ where: { id: habit.id }, data: { updatedAt: new Date() } });

  const entries = await db.habitEntry.findMany({ where: { habitId: habit.id }, select: { date: true, count: true }, orderBy: { date: "asc" } });
  const item = serializeHabit(habit, entries, tz, todayKey);
  const justCompleted = current < target && next >= target;
  if (justCompleted && key === todayKey && STREAK_MILESTONES.includes(item.streak)) {
    await safeNotify(user.id, {
      type: "HABIT",
      title: `${item.streak}-day streak: ${habit.name}`,
      body: item.streak === item.bestStreak ? "That's your best streak yet." : "Keep it going.",
      link: "/habits",
      sourceId: `habit-streak-${habit.id}-${item.streak}`,
      dedupeHours: 24 * 30,
      push: false,
    });
  }
  return { item, date: key, count: next, done: next >= target };
});
