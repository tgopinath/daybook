import "server-only";
import type { CalendarEvent, Reminder } from "@prisma/client";
import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";
import { nextOccurrence, type RecurrenceKind } from "@/lib/recurrence";
import type { Granularity, RangeKey } from "@/components/dashboard/types";

// ---------- Formatting (all in the caller's timezone) ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "4:00 PM" */
export function timeLabel(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

/** "HH:mm" → "4:00 PM" */
export function hhmmLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = (h ?? 0) % 12 || 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
}

/** Local HH:mm of an instant. */
export function localHHmm(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function localHour(d: Date, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
}

const keyParts = (key: string) => key.split("-").map(Number) as [number, number, number];

/** "Thu 19 Nov" */
export function shortDayLabel(key: string) {
  const [, m, d] = keyParts(key);
  return `${WEEKDAYS[weekdayOfKey(key)]} ${d} ${MONTHS[m - 1]}`;
}

/** "Today" | "Tomorrow" | "Yesterday" | "Thu 19 Nov" */
export function relDayLabel(key: string, todayKey: string) {
  if (key === todayKey) return "Today";
  if (key === addDaysKey(todayKey, 1)) return "Tomorrow";
  if (key === addDaysKey(todayKey, -1)) return "Yesterday";
  return shortDayLabel(key);
}

/** "Tuesday, 17 November" */
export function longDayLabel(key: string) {
  const [, m, d] = keyParts(key);
  return `${WEEKDAYS_LONG[weekdayOfKey(key)]}, ${d} ${MONTHS_LONG[m - 1]}`;
}

export const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

// ---------- Ranges and buckets ----------

export interface Bucket {
  key: string;
  startKey: string; // inclusive day key
  endKey: string; // exclusive day key
  label: string;
  fullLabel: string;
}

export function parseRange(v: string | null): RangeKey {
  return v === "7d" || v === "30d" || v === "90d" || v === "12m" ? v : "30d";
}

/**
 * Chart buckets ending today: 7d/30d → days, 90d → 13 rolling weeks, 12m → 12 calendar months.
 */
export function buildBuckets(range: RangeKey, todayKey: string): { granularity: Granularity; buckets: Bucket[] } {
  const buckets: Bucket[] = [];
  if (range === "7d" || range === "30d") {
    const n = range === "7d" ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const k = addDaysKey(todayKey, -i);
      const [, m, d] = keyParts(k);
      buckets.push({ key: k, startKey: k, endKey: addDaysKey(k, 1), label: n === 7 ? WEEKDAYS[weekdayOfKey(k)]! : `${d} ${MONTHS[m - 1]}`, fullLabel: shortDayLabel(k) });
    }
    return { granularity: "day", buckets };
  }
  if (range === "90d") {
    for (let i = 12; i >= 0; i--) {
      const end = addDaysKey(todayKey, -i * 7 + 1); // exclusive
      const start = addDaysKey(end, -7);
      const [, sm, sd] = keyParts(start);
      const last = addDaysKey(end, -1);
      const [, em, ed] = keyParts(last);
      buckets.push({ key: start, startKey: start, endKey: end, label: `${sd} ${MONTHS[sm - 1]}`, fullLabel: `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]}` });
    }
    return { granularity: "week", buckets };
  }
  const [ty, tm] = keyParts(todayKey);
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(ty, tm - 1 - i, 1));
    const next = new Date(Date.UTC(ty, tm - i, 1));
    const startKey = dt.toISOString().slice(0, 10);
    buckets.push({
      key: startKey.slice(0, 7),
      startKey,
      endKey: next.toISOString().slice(0, 10),
      label: MONTHS[dt.getUTCMonth()]!,
      fullLabel: `${MONTHS_LONG[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`,
    });
  }
  return { granularity: "month", buckets };
}

/** Index of the bucket containing a day key, or -1. */
export function bucketIndexer(buckets: Bucket[]) {
  return (key: string) => {
    // Buckets are contiguous and sorted; binary search.
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const b = buckets[mid]!;
      if (key < b.startKey) hi = mid - 1;
      else if (key >= b.endKey) lo = mid + 1;
      else return mid;
    }
    return -1;
  };
}

export function rangeBounds(buckets: Bucket[], tz: string): [Date, Date] {
  return [zonedToUtc(buckets[0]!.startKey, "00:00", tz), zonedToUtc(buckets[buckets.length - 1]!.endKey, "00:00", tz)];
}

// ---------- Goals ----------

export interface GoalLike {
  status: string;
  targetValue: number | null;
  currentValue: number;
  startDate: Date;
  targetDate: Date | null;
  milestones: { done: boolean }[];
  tasks: { status: string }[];
}

/** targetValue → current/target; else milestones done/total; else linked tasks done/total. */
export function goalProgress(g: GoalLike): number {
  if (g.status === "COMPLETED") return 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  if (g.targetValue != null && g.targetValue > 0) return clamp((g.currentValue / g.targetValue) * 100);
  if (g.milestones.length) return clamp((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
  const tasks = g.tasks.filter((t) => t.status !== "CANCELLED");
  if (tasks.length) return clamp((tasks.filter((t) => t.status === "COMPLETED").length / tasks.length) * 100);
  return 0;
}

/** How far through the start→target window we are (0-100), null without a deadline. */
export function goalExpected(g: Pick<GoalLike, "startDate" | "targetDate">, now: Date): number | null {
  if (!g.targetDate) return null;
  const s = g.startDate.getTime();
  const e = g.targetDate.getTime();
  if (e <= s) return null;
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - s) / (e - s)) * 100)));
}

export const goalInclude = {
  milestones: { select: { done: true } },
  tasks: { where: { deletedAt: null }, select: { status: true } },
} as const;

// ---------- Habits ----------

export interface HabitLike {
  frequency: string;
  daysOfWeek: number[];
  targetPerDay: number;
  createdAt: Date;
  entries: { date: string; count: number }[];
}

export function isScheduled(h: Pick<HabitLike, "frequency" | "daysOfWeek">, key: string) {
  if (h.frequency !== "weekly" || !h.daysOfWeek.length) return true;
  return h.daysOfWeek.includes(weekdayOfKey(key));
}

export function habitStartKey(h: HabitLike, todayKey: string, tz: string) {
  let start = dayKey(h.createdAt, tz);
  for (const e of h.entries) if (e.date < start) start = e.date;
  return start > todayKey ? todayKey : start;
}

export function habitDoneMap(h: HabitLike) {
  const m = new Map<string, number>();
  for (const e of h.entries) m.set(e.date, (m.get(e.date) ?? 0) + e.count);
  const target = Math.max(1, h.targetPerDay || 1);
  return (key: string) => (m.get(key) ?? 0) >= target;
}

/** Consecutive scheduled days with a completed entry, walking back from today. Today not yet done doesn't break it. */
export function currentStreak(h: HabitLike, todayKey: string, tz: string) {
  const done = habitDoneMap(h);
  const start = habitStartKey(h, todayKey, tz);
  let streak = 0;
  for (let k = todayKey, i = 0; k >= start && i < 3700; k = addDaysKey(k, -1), i++) {
    if (!isScheduled(h, k)) continue;
    if (done(k)) streak++;
    else if (k === todayKey) continue;
    else break;
  }
  return streak;
}

/**
 * Scheduled vs completed habit-days per bucket. Today only counts as scheduled
 * once it's done, so an unfinished morning doesn't drag the rate down.
 */
export function habitBucketStats(h: HabitLike, buckets: Bucket[], todayKey: string, tz: string) {
  const done = habitDoneMap(h);
  const start = habitStartKey(h, todayKey, tz);
  const idx = bucketIndexer(buckets);
  const out = buckets.map(() => ({ done: 0, scheduled: 0 }));
  let k = buckets[0]!.startKey > start ? buckets[0]!.startKey : start;
  for (let i = 0; k <= todayKey && i < 400; k = addDaysKey(k, 1), i++) {
    if (!isScheduled(h, k)) continue;
    const b = idx(k);
    if (b < 0) continue;
    const d = done(k);
    if (k === todayKey && !d) continue;
    out[b]!.scheduled++;
    if (d) out[b]!.done++;
  }
  return out;
}

// ---------- Reminders & events ----------

type ReminderRow = Pick<Reminder, "id" | "title" | "kind" | "remindAt" | "recurrence" | "intervalMinutes" | "daysOfWeek" | "endsAt" | "snoozedUntil">;

/** Fire times of a reminder within [from, to), at most `max`. Includes recurring occurrences. */
export function reminderOccurrences(r: ReminderRow, from: Date, to: Date, max: number): Date[] {
  const out: Date[] = [];
  const effective = r.snoozedUntil && r.snoozedUntil > r.remindAt ? r.snoozedUntil : r.remindAt;
  if (effective >= from && effective < to && (!r.endsAt || effective <= r.endsAt)) out.push(effective);
  if (r.recurrence === "NONE") return out;
  const spec = { recurrence: r.recurrence as RecurrenceKind, intervalMinutes: r.intervalMinutes, daysOfWeek: r.daysOfWeek, endsAt: r.endsAt };
  let after = new Date(Math.max(effective.getTime(), from.getTime() - 1));
  while (out.length < max) {
    const n = nextOccurrence(r.remindAt, spec, after);
    if (!n || n >= to) break;
    out.push(n);
    after = n;
  }
  return out.slice(0, max);
}

type EventRow = Pick<CalendarEvent, "id" | "title" | "start" | "end" | "allDay" | "kind" | "color" | "location" | "recurrence">;

/** Occurrences of an event overlapping [from, to), projecting DAILY/WEEKLY/MONTHLY/YEARLY recurrence. */
export function eventOccurrences(ev: EventRow, from: Date, to: Date, max = 40): { start: Date; end: Date }[] {
  const dur = ev.end.getTime() - ev.start.getTime();
  const overlaps = (s: Date) => s < to && s.getTime() + Math.max(dur, 1) > from.getTime();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(ev.recurrence)) {
    return overlaps(ev.start) ? [{ start: ev.start, end: ev.end }] : [];
  }
  const out: { start: Date; end: Date }[] = [];
  let s = new Date(ev.start);
  // Fast-forward fixed-length recurrences.
  if (ev.recurrence === "DAILY" || ev.recurrence === "WEEKLY") {
    const step = (ev.recurrence === "DAILY" ? 1 : 7) * 86400000;
    const skip = Math.floor((from.getTime() - dur - s.getTime()) / step) - 1;
    if (skip > 0) s = new Date(s.getTime() + skip * step);
  }
  for (let i = 0; i < 5000 && s < to && out.length < max; i++) {
    if (overlaps(s)) out.push({ start: new Date(s), end: new Date(s.getTime() + dur) });
    const n = new Date(s);
    if (ev.recurrence === "DAILY") n.setUTCDate(n.getUTCDate() + 1);
    else if (ev.recurrence === "WEEKLY") n.setUTCDate(n.getUTCDate() + 7);
    else if (ev.recurrence === "MONTHLY") n.setUTCMonth(n.getUTCMonth() + 1);
    else n.setUTCFullYear(n.getUTCFullYear() + 1);
    s = n;
  }
  return out;
}

export const PRIORITY_LABEL = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" } as const;
