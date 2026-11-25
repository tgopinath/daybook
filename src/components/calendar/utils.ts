import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";
import type { CalendarFeed, CalItem, CalOccurrence, CalView, EventKind, Layers } from "./types";

export const HOUR_PX = 48;
export const SNAP_MIN = 15;
export const DAY_MS = 86400000;

export const PALETTE = ["#993399", "#3B9BE9", "#14B8A6", "#20A779", "#E9A23B", "#F97316", "#E45D5D", "#8B5CF6"];

export const KIND_META: Record<EventKind, { label: string; color: string }> = {
  event: { label: "Event", color: "#3B9BE9" },
  meeting: { label: "Meeting", color: "#993399" },
  personal: { label: "Personal", color: "#20A779" },
  birthday: { label: "Birthday", color: "#E45D5D" },
  important: { label: "Important", color: "#E9A23B" },
};

export const TASK_COLOR = "#737780";
export const REMINDER_COLOR = "#E9A23B";

export function eventColor(e: { color: string | null; category: { color: string } | null; kind: EventKind }) {
  return e.color || e.category?.color || KIND_META[e.kind]?.color || PALETTE[0]!;
}

/** Tinted background for a colored block that works in light and dark themes. */
export function tint(color: string, pct = 14) {
  return `color-mix(in srgb, ${color} ${pct}%, var(--surface))`;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions) {
  const k = tz + JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    fmtCache.set(k, f);
  }
  return f;
}

/** Minutes since local midnight in tz. */
export function minutesOfDay(d: Date | number, tz: string) {
  const parts = fmt(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(typeof d === "number" ? new Date(d) : d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function hhmm(minutes: number) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** UTC ms for a day key + minutes-of-day in tz (minutes may exceed a day). */
export function keyMinutesToMs(key: string, minutes: number, tz: string) {
  const extraDays = Math.floor(minutes / 1440);
  const rem = minutes - extraDays * 1440;
  return zonedToUtc(addDaysKey(key, extraDays), hhmm(rem), tz).getTime();
}

export function startOfDayMs(key: string, tz: string) {
  return zonedToUtc(key, "00:00", tz).getTime();
}

export function formatTime(d: Date | number, tz: string) {
  return fmt(tz, { hour: "numeric", minute: "2-digit" }).format(typeof d === "number" ? new Date(d) : d).replace(":00", "").replace(" ", " ");
}

export function formatTimeRange(s: number, e: number, tz: string) {
  return `${formatTime(s, tz)} – ${formatTime(e, tz)}`;
}

function keyDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}

export function formatKey(key: string, opts: Intl.DateTimeFormatOptions) {
  return fmt("UTC", opts).format(keyDate(key));
}

export function keyParts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

export function diffDays(a: string, b: string) {
  return Math.round((keyDate(b).getTime() - keyDate(a).getTime()) / DAY_MS);
}

export function startOfWeekKey(key: string, weekStart: number) {
  const wd = weekdayOfKey(key);
  return addDaysKey(key, -((wd - weekStart + 7) % 7));
}

export function firstOfMonthKey(key: string) {
  return key.slice(0, 8) + "01";
}

export function addMonthsKey(key: string, n: number) {
  const { y, m, d } = keyParts(key);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

/** Day keys of a month grid (whole weeks covering the month). */
export function monthGridKeys(anchor: string, weekStart: number) {
  const first = firstOfMonthKey(anchor);
  const start = startOfWeekKey(first, weekStart);
  const nextMonth = addMonthsKey(first, 1);
  const keys: string[] = [];
  let k = start;
  while (keys.length < 42 && (keys.length % 7 !== 0 || k < nextMonth)) {
    keys.push(k);
    k = addDaysKey(k, 1);
  }
  return keys;
}

export function viewDays(view: CalView, anchor: string, weekStart: number, agendaDays: number): string[] {
  if (view === "day") return [anchor];
  if (view === "week") {
    const s = startOfWeekKey(anchor, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDaysKey(s, i));
  }
  if (view === "month") return monthGridKeys(anchor, weekStart);
  return Array.from({ length: agendaDays }, (_, i) => addDaysKey(anchor, i));
}

export function viewTitle(view: CalView, anchor: string, weekStart: number) {
  if (view === "day") return formatKey(anchor, { month: "long", day: "numeric", year: "numeric" });
  if (view === "week") {
    const days = viewDays("week", anchor, weekStart, 0);
    const a = days[0]!;
    const b = days[6]!;
    if (a.slice(0, 7) === b.slice(0, 7)) return formatKey(a, { month: "long", year: "numeric" });
    if (a.slice(0, 4) === b.slice(0, 4)) return `${formatKey(a, { month: "short" })} – ${formatKey(b, { month: "short", year: "numeric" })}`;
    return `${formatKey(a, { month: "short", year: "numeric" })} – ${formatKey(b, { month: "short", year: "numeric" })}`;
  }
  if (view === "month") return formatKey(anchor, { month: "long", year: "numeric" });
  return `${formatKey(anchor, { month: "short", day: "numeric" })} onward`;
}

export function stepAnchor(view: CalView, anchor: string, dir: 1 | -1) {
  if (view === "day") return addDaysKey(anchor, dir);
  if (view === "week") return addDaysKey(anchor, 7 * dir);
  if (view === "month") return addMonthsKey(firstOfMonthKey(anchor), dir);
  return addDaysKey(anchor, 30 * dir);
}

/** Shift an instant by n whole days keeping its wall-clock time in tz. */
export function shiftDaysMs(ms: number, n: number, tz: string) {
  if (n === 0) return ms;
  return keyMinutesToMs(addDaysKey(dayKey(new Date(ms), tz), n), minutesOfDay(ms, tz), tz) + (ms % 60000);
}

/** Convert the feed into flat view items, honoring layer filters. */
export function buildItems(feed: CalendarFeed | undefined, tz: string, layers: Layers): CalItem[] {
  if (!feed) return [];
  const items: CalItem[] = [];
  if (layers.events) {
    for (const e of feed.events) {
      items.push({ type: "event", key: e.occurrenceKey, title: e.title, start: Date.parse(e.occurrenceStart), end: Date.parse(e.occurrenceEnd), allDay: e.allDay, color: eventColor(e), event: e });
    }
  }
  if (layers.tasks) {
    for (const t of feed.tasks) {
      const due = Date.parse(t.dueDate);
      const color = t.category?.color ?? TASK_COLOR;
      if (t.startTime) {
        const key = dayKey(new Date(due), tz);
        const [sh, sm] = t.startTime.split(":").map(Number);
        const start = keyMinutesToMs(key, sh! * 60 + sm!, tz);
        let end = start + 30 * 60000;
        if (t.endTime) {
          const [eh, em] = t.endTime.split(":").map(Number);
          const e = keyMinutesToMs(key, eh! * 60 + em!, tz);
          if (e > start) end = e;
        }
        items.push({ type: "task", key: `task:${t.id}`, title: t.title, start, end, allDay: false, color, task: t });
      } else {
        items.push({ type: "task", key: `task:${t.id}`, title: t.title, start: due, end: due, allDay: true, color, task: t });
      }
    }
  }
  if (layers.reminders) {
    for (const r of feed.reminders) {
      // Event reminders are represented by the event itself.
      if (r.eventId && layers.events) continue;
      const at = Date.parse(r.occurrenceAt);
      items.push({ type: "reminder", key: `rem:${r.occurrenceKey}`, title: r.title, start: at, end: at, allDay: true, color: REMINDER_COLOR, reminder: r });
    }
  }
  return items;
}

/** Day keys an item touches (end-exclusive), clipped to the given set of days. */
export function itemDayKeys(item: Pick<CalItem, "start" | "end">, tz: string): string[] {
  const s = dayKey(new Date(item.start), tz);
  const endMs = item.end > item.start ? item.end - 1 : item.start;
  const e = dayKey(new Date(endMs), tz);
  const out = [s];
  let k = s;
  for (let i = 0; k < e && i < 60; i++) {
    k = addDaysKey(k, 1);
    out.push(k);
  }
  return out;
}

/** True for items that belong in the all-day lane / month chips rather than the time grid. */
export function isAllDayLike(item: CalItem, tz: string) {
  if (item.allDay) return true;
  return itemDayKeys(item, tz).length > 1 && item.end - item.start >= DAY_MS;
}

export function sortItems(a: CalItem, b: CalItem) {
  const rank = (i: CalItem) => (i.type === "event" ? (i.allDay ? 0 : 1) : i.type === "task" ? 2 : 3);
  return rank(a) - rank(b) || a.start - b.start || a.title.localeCompare(b.title);
}

/** Side-by-side layout for overlapping timed blocks. Returns column index and column count per key. */
export function layoutOverlaps<T extends { key: string; s: number; e: number }>(blocks: T[]) {
  const sorted = [...blocks].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: T[] = [];
  let colsEnd: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cols = colsEnd.length;
    for (const b of cluster) out.get(b.key)!.cols = cols;
    cluster = [];
    colsEnd = [];
  };
  for (const b of sorted) {
    if (b.s >= clusterEnd) flush();
    let col = colsEnd.findIndex((end) => end <= b.s);
    if (col === -1) {
      col = colsEnd.length;
      colsEnd.push(b.e);
    } else colsEnd[col] = b.e;
    out.set(b.key, { col, cols: 1 });
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.e);
  }
  flush();
  return out;
}

export function isoRange(days: string[], tz: string) {
  const from = new Date(startOfDayMs(days[0]!, tz)).toISOString();
  const to = new Date(startOfDayMs(addDaysKey(days[days.length - 1]!, 1), tz)).toISOString();
  return { from, to };
}

export function occurrenceDeltaToBase(e: CalOccurrence, newOccStart: number, newOccEnd: number) {
  const ds = newOccStart - Date.parse(e.occurrenceStart);
  const de = newOccEnd - Date.parse(e.occurrenceEnd);
  return { start: new Date(Date.parse(e.start) + ds).toISOString(), end: new Date(Date.parse(e.end) + de).toISOString() };
}

export const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At start time" },
  { value: "5", label: "5 minutes before" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];
