// Next-occurrence math for reminders, recurring tasks and habits.
import { tzOffsetMinutes, zonedToUtc } from "./time";
export type RecurrenceKind = "NONE" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

export interface RecurrenceSpec {
  recurrence: RecurrenceKind;
  intervalMinutes?: number | null; // HOURLY / CUSTOM
  daysOfWeek?: number[] | null; // WEEKLY / CUSTOM (0 = Sunday)
  endsAt?: Date | null;
}

/** First occurrence strictly after `after`, starting from anchor `from`. Null when finished. */
export function nextOccurrence(from: Date, spec: RecurrenceSpec, after: Date = new Date()): Date | null {
  if (spec.recurrence === "NONE") return null;
  let next = new Date(from);
  const step = (d: Date): Date => {
    const n = new Date(d);
    switch (spec.recurrence) {
      case "HOURLY":
        n.setTime(n.getTime() + (spec.intervalMinutes || 60) * 60000);
        break;
      case "DAILY":
        n.setUTCDate(n.getUTCDate() + 1);
        break;
      case "WEEKLY":
      case "CUSTOM": {
        if (spec.recurrence === "CUSTOM" && spec.intervalMinutes && !spec.daysOfWeek?.length) {
          n.setTime(n.getTime() + spec.intervalMinutes * 60000);
          break;
        }
        const days = spec.daysOfWeek?.length ? spec.daysOfWeek : [d.getUTCDay()];
        do n.setUTCDate(n.getUTCDate() + 1);
        while (!days.includes(n.getUTCDay()));
        break;
      }
      case "MONTHLY":
        n.setUTCMonth(n.getUTCMonth() + 1);
        break;
      case "YEARLY":
        n.setUTCFullYear(n.getUTCFullYear() + 1);
        break;
    }
    return n;
  };
  // Guard against runaway loops for very old anchors.
  for (let i = 0; i < 100000 && next <= after; i++) next = step(next);
  if (next <= after) return null;
  if (spec.endsAt && next > spec.endsAt) return null;
  return next;
}

/**
 * nextOccurrence evaluated on the user's wall clock, so "daily at 08:00" stays
 * at 08:00 across DST and weekday rules use the local weekday. Fixed intervals
 * (every N minutes) are computed on absolute time. Prefer this whenever the
 * user's timezone is known.
 */
export function nextOccurrenceTz(from: Date, spec: RecurrenceSpec, after: Date, tz: string): Date | null {
  if (spec.recurrence === "NONE") return null;
  const fixedInterval = spec.recurrence === "HOURLY" || (spec.recurrence === "CUSTOM" && !!spec.intervalMinutes && !spec.daysOfWeek?.length);
  if (fixedInterval || tz === "UTC") return nextOccurrence(from, spec, after);
  const toWall = (d: Date) => new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000);
  const wall = nextOccurrence(toWall(from), { ...spec, endsAt: spec.endsAt ? toWall(spec.endsAt) : null }, toWall(after));
  if (!wall) return null;
  const iso = wall.toISOString();
  const utc = zonedToUtc(iso.slice(0, 10), iso.slice(11, 16), tz);
  if (utc <= after) return nextOccurrenceTz(new Date(utc.getTime() + 60000), spec, after, tz);
  return utc;
}

export function describeRecurrence(spec: RecurrenceSpec): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (spec.recurrence) {
    case "NONE":
      return "One time";
    case "HOURLY": {
      const m = spec.intervalMinutes || 60;
      return m % 60 === 0 ? (m === 60 ? "Every hour" : `Every ${m / 60} hours`) : `Every ${m} minutes`;
    }
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return spec.daysOfWeek?.length ? `Weekly on ${spec.daysOfWeek.map((d) => names[d]).join(", ")}` : "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "YEARLY":
      return "Yearly";
    case "CUSTOM":
      if (spec.daysOfWeek?.length) return `On ${spec.daysOfWeek.map((d) => names[d]).join(", ")}`;
      if (spec.intervalMinutes) return `Every ${spec.intervalMinutes} minutes`;
      return "Custom";
  }
}
