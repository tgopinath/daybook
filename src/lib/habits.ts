// Pure habit helpers: schedules, streaks, completion rates and progress
// messages. Shared by API routes, the dashboard, the AI module and the client
// (for optimistic updates). No server-only imports.
import { addDaysKey, weekdayOfKey } from "./time";

export interface HabitSchedule {
  frequency: string; // "daily" | "weekly" (specific weekdays)
  daysOfWeek: number[]; // 0 = Sunday
  targetPerDay: number;
  createdAt?: Date | string; // first day that can count; defaults to earliest entry
}

export interface HabitEntryLike {
  date: string; // yyyy-MM-dd
  count: number;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

/** Is the habit scheduled on this day key? */
export function isScheduled(habit: Pick<HabitSchedule, "frequency" | "daysOfWeek">, key: string): boolean {
  if (habit.frequency !== "weekly") return true;
  if (!habit.daysOfWeek?.length) return true;
  return habit.daysOfWeek.includes(weekdayOfKey(key));
}

export function describeSchedule(habit: Pick<HabitSchedule, "frequency" | "daysOfWeek">): string {
  if (habit.frequency !== "weekly" || !habit.daysOfWeek?.length || habit.daysOfWeek.length === 7) return "Every day";
  const d = [...habit.daysOfWeek].sort((a, b) => a - b);
  if (d.join() === "1,2,3,4,5") return "Weekdays";
  if (d.join() === "0,6") return "Weekends";
  return d.map((x) => WEEKDAY_SHORT[x]).join(", ");
}

export function entryMap(entries: HabitEntryLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + e.count);
  return m;
}

const target = (h: HabitSchedule) => Math.max(1, h.targetPerDay || 1);

/** First day key that counts toward stats: creation day (in the caller's tz), or earliest entry if older. */
export function habitStartKey(entries: HabitEntryLike[], habit: HabitSchedule, todayKey: string, tzKeyOf?: (d: Date) => string): string {
  let start = todayKey;
  if (habit.createdAt) {
    const d = habit.createdAt instanceof Date ? habit.createdAt : new Date(habit.createdAt);
    start = tzKeyOf ? tzKeyOf(d) : d.toISOString().slice(0, 10);
  }
  for (const e of entries) if (e.date < start) start = e.date;
  return start > todayKey ? todayKey : start;
}

/**
 * Current and best streak in scheduled days. Unscheduled days are skipped
 * (they neither count nor break a streak). Today not yet done does not break
 * the current streak.
 */
export function habitStreak(
  entries: HabitEntryLike[],
  habit: HabitSchedule,
  todayKey: string,
  opts: { startKey?: string } = {},
): { current: number; best: number } {
  const map = entryMap(entries);
  const t = target(habit);
  const done = (k: string) => (map.get(k) ?? 0) >= t;
  const start = opts.startKey ?? habitStartKey(entries, habit, todayKey);

  // Current streak: walk backwards from today.
  let current = 0;
  for (let k = todayKey, i = 0; k >= start && i < 3700; k = addDaysKey(k, -1), i++) {
    if (!isScheduled(habit, k)) continue;
    if (done(k)) current++;
    else if (k === todayKey) continue;
    else break;
  }

  // Best streak: walk forwards from the start.
  let best = 0;
  let run = 0;
  for (let k = start, i = 0; k <= todayKey && i < 3700; k = addDaysKey(k, 1), i++) {
    if (!isScheduled(habit, k)) continue;
    if (done(k)) {
      run++;
      if (run > best) best = run;
    } else if (k !== todayKey) run = 0;
  }
  return { current, best: Math.max(best, current) };
}

/**
 * Completion rate (0–100) over the last `days` days ending today, counting
 * only scheduled days since the habit started. Today counts only once done.
 */
export function habitCompletionRate(
  entries: HabitEntryLike[],
  habit: HabitSchedule,
  todayKey: string,
  days = 30,
  opts: { startKey?: string } = {},
): number {
  const { done, scheduled } = habitCompletionCounts(entries, habit, todayKey, days, opts);
  return scheduled ? Math.round((done / scheduled) * 100) : 0;
}

export function habitCompletionCounts(
  entries: HabitEntryLike[],
  habit: HabitSchedule,
  todayKey: string,
  days = 30,
  opts: { startKey?: string } = {},
): { done: number; scheduled: number } {
  const map = entryMap(entries);
  const t = target(habit);
  const start = opts.startKey ?? habitStartKey(entries, habit, todayKey);
  let done = 0;
  let scheduled = 0;
  for (let i = 0; i < days; i++) {
    const k = addDaysKey(todayKey, -i);
    if (k < start) break;
    if (!isScheduled(habit, k)) continue;
    const ok = (map.get(k) ?? 0) >= t;
    if (k === todayKey && !ok) continue;
    scheduled++;
    if (ok) done++;
  }
  return { done, scheduled };
}

/** Scheduled past days (after start, before today) with no completed entry. */
export function habitMissedDays(entries: HabitEntryLike[], habit: HabitSchedule, todayKey: string, days = 7, opts: { startKey?: string } = {}): string[] {
  const map = entryMap(entries);
  const t = target(habit);
  const start = opts.startKey ?? habitStartKey(entries, habit, todayKey);
  const out: string[] = [];
  for (let i = 1; i <= days; i++) {
    const k = addDaysKey(todayKey, -i);
    if (k < start) break;
    if (isScheduled(habit, k) && (map.get(k) ?? 0) < t) out.push(k);
  }
  return out;
}

/** Last `n` day keys ending today, oldest first. */
export function lastDays(todayKey: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDaysKey(todayKey, i - n + 1));
}

/** Per-habit stats bundle (what GET /api/habits returns for each habit). */
export function habitStats(entries: HabitEntryLike[], habit: HabitSchedule, todayKey: string, opts: { startKey?: string } = {}) {
  const startKey = opts.startKey ?? habitStartKey(entries, habit, todayKey);
  const map = entryMap(entries);
  const todayCount = map.get(todayKey) ?? 0;
  const { current, best } = habitStreak(entries, habit, todayKey, { startKey });
  return {
    startKey,
    todayCount,
    doneToday: todayCount >= target(habit),
    scheduledToday: isScheduled(habit, todayKey),
    streak: current,
    bestStreak: best,
    rate30: habitCompletionRate(entries, habit, todayKey, 30, { startKey }),
    rate7: habitCompletionRate(entries, habit, todayKey, 7, { startKey }),
    missedYesterday: (() => {
      const y = addDaysKey(todayKey, -1);
      return y >= startKey && isScheduled(habit, y) && (map.get(y) ?? 0) < target(habit);
    })(),
  };
}

/**
 * An encouraging line grounded in actual progress across today's habits.
 * Returns null when there's nothing honest to say.
 */
export function habitsDailyMessage(
  habits: { name: string; scheduledToday: boolean; doneToday: boolean; streak: number; bestStreak: number; missedYesterday: boolean }[],
): string | null {
  const due = habits.filter((h) => h.scheduledToday);
  if (!due.length) return habits.length ? "Nothing scheduled today — enjoy the rest day." : null;
  const done = due.filter((h) => h.doneToday).length;
  const left = due.length - done;
  const record = due.find((h) => h.doneToday && h.streak >= 3 && h.streak === h.bestStreak);
  if (left === 0) {
    if (record) return `All ${due.length} done — and a new best streak for ${record.name}: ${record.streak} days.`;
    return `All ${due.length} habits done today.`;
  }
  if (record) return `New best streak: ${record.name}, ${record.streak} days. ${left} to go today.`;
  const missed = due.filter((h) => h.missedYesterday && !h.doneToday);
  if (done === 0 && missed.length) return "You missed yesterday — today is a fresh start.";
  if (done === 0) return `${due.length} ${due.length === 1 ? "habit" : "habits"} scheduled today.`;
  const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return `${done} of ${due.length} done — ${words[left] ?? left} to go.`;
}

/** A single-habit message for the detail view. */
export function habitMessage(s: { doneToday: boolean; scheduledToday: boolean; streak: number; bestStreak: number; rate30: number; missedYesterday: boolean; todayCount: number }, targetPerDay: number): string {
  if (s.doneToday && s.streak >= 2 && s.streak === s.bestStreak) return `New best streak: ${s.streak} days.`;
  if (s.doneToday) return s.streak > 1 ? `Done today — ${s.streak} days in a row.` : "Done today.";
  if (!s.scheduledToday) return "Not scheduled today.";
  if (targetPerDay > 1 && s.todayCount > 0) return `${s.todayCount} of ${targetPerDay} so far — ${targetPerDay - s.todayCount} to go.`;
  if (s.missedYesterday) return "You missed yesterday — today is a fresh start.";
  if (s.streak > 0) return `Keep your ${s.streak}-day streak going today.`;
  return s.rate30 > 0 ? `${s.rate30}% completion over the last 30 days.` : "Check in today to start a streak.";
}
