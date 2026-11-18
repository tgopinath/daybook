import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";

/** HH:mm of an instant in tz. */
export function timeOfDay(iso: string | Date, tz: string) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Move an instant to another local day, keeping its time-of-day. */
export function moveToDay(iso: string | null, day: string, tz: string) {
  const time = iso ? timeOfDay(iso, tz) : "23:59";
  return zonedToUtc(day, time, tz).toISOString();
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDayKey(key: string, today: string) {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return WEEKDAYS[weekdayOfKey(key)]!;
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}${y !== Number(today.slice(0, 4)) ? `, ${y}` : ""}`;
}

export type DueInfo = { label: string; key: string; overdue: boolean; today: boolean };

export function dueInfo(iso: string | null, tz: string, done = false): DueInfo | null {
  if (!iso) return null;
  const today = dayKey(new Date(), tz);
  const key = dayKey(new Date(iso), tz);
  return { label: fmtDayKey(key, today), key, overdue: !done && key < today, today: key === today };
}

export function fmtTime(hhmm: string | null | undefined) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h! >= 12 ? "PM" : "AM";
  const hr = h! % 12 || 12;
  return m ? `${hr}:${String(m).padStart(2, "0")} ${ampm}` : `${hr} ${ampm}`;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Quick due-date choices relative to today in tz. */
export function quickDays(tz: string) {
  const today = dayKey(new Date(), tz);
  const wd = weekdayOfKey(today);
  const toSat = (6 - wd + 7) % 7 || 7;
  const toMon = (8 - wd) % 7 || 7;
  return [
    { label: "Today", key: today },
    { label: "Tomorrow", key: addDaysKey(today, 1) },
    { label: "This weekend", key: addDaysKey(today, toSat) },
    { label: "Next week", key: addDaysKey(today, toMon) },
  ];
}

export function safeStorage() {
  return {
    get(k: string) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k: string, v: string) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* ignore */
      }
    },
  };
}
