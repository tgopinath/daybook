import { db } from "@/lib/db";
import { route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey, weekdayOfKey } from "@/lib/time";
import { entryMap, habitCompletionCounts, habitMissedDays, habitStats, isScheduled } from "@/lib/habits";
import { findHabit } from "../../_shared";

type P = { id: string };

/** Detailed stats: streaks, rates, monthly breakdown, weekday pattern, missed days. */
export const GET = route<P>(async ({ req, user, params }) => {
  const habit = await findHabit(user.id, params.id);
  const entries = await db.habitEntry.findMany({ where: { habitId: habit.id }, select: { date: true, count: true }, orderBy: { date: "asc" } });
  const tz = tzOf(req);
  const todayKey = dayKey(new Date(), tz);
  let startKey = dayKey(habit.createdAt, tz);
  for (const e of entries) if (e.date < startKey) startKey = e.date;
  if (startKey > todayKey) startKey = todayKey;

  const base = habitStats(entries, habit, todayKey, { startKey });
  const target = Math.max(1, habit.targetPerDay);
  const map = entryMap(entries);
  const done = (k: string) => (map.get(k) ?? 0) >= target;

  // Last 6 calendar months.
  const months: { month: string; label: string; done: number; scheduled: number; rate: number }[] = [];
  const [ty, tm] = todayKey.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(ty!, tm! - 1 - i, 1));
    const month = d.toISOString().slice(0, 7);
    let dn = 0;
    let sc = 0;
    for (let k = `${month}-01`; k.startsWith(month) && k <= todayKey; k = addDaysKey(k, 1)) {
      if (k < startKey || !isScheduled(habit, k)) continue;
      if (k === todayKey && !done(k)) continue;
      sc++;
      if (done(k)) dn++;
    }
    months.push({ month, label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), done: dn, scheduled: sc, rate: sc ? Math.round((dn / sc) * 100) : 0 });
  }

  // Weekday pattern over the last 12 weeks.
  const weekdays = Array.from({ length: 7 }, (_, d) => ({ day: d, done: 0, scheduled: 0, rate: 0 }));
  for (let i = 0; i < 84; i++) {
    const k = addDaysKey(todayKey, -i);
    if (k < startKey) break;
    if (!isScheduled(habit, k) || (k === todayKey && !done(k))) continue;
    const w = weekdays[weekdayOfKey(k)]!;
    w.scheduled++;
    if (done(k)) w.done++;
  }
  for (const w of weekdays) w.rate = w.scheduled ? Math.round((w.done / w.scheduled) * 100) : 0;

  const c30 = habitCompletionCounts(entries, habit, todayKey, 30, { startKey });
  return {
    ...base,
    todayKey,
    totalCompletions: entries.filter((e) => e.count >= target).length,
    totalCount: entries.reduce((s, e) => s + e.count, 0),
    last30: c30,
    months,
    weekdays,
    missedLast14: habitMissedDays(entries, habit, todayKey, 14, { startKey }),
  };
});
