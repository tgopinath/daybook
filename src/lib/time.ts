// Timezone-aware helpers shared by server and client. Dates are stored in UTC;
// "today" and day keys are computed in the user's IANA timezone.

export function dayKey(date: Date, tz: string): string {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Offset in minutes between tz and UTC at the given instant (positive east of UTC). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** UTC instant for a wall-clock time (yyyy-MM-dd, HH:mm) in tz. */
export function zonedToUtc(day: string, time: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh ?? 0, mm ?? 0));
  const off = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - off * 60000);
  // Correct across DST boundaries
  const off2 = tzOffsetMinutes(result, tz);
  return off2 === off ? result : new Date(guess.getTime() - off2 * 60000);
}

/** [start, end) of the user's local day containing `date`, as UTC instants. */
export function dayRange(date: Date, tz: string): [Date, Date] {
  const key = dayKey(date, tz);
  const start = zonedToUtc(key, "00:00", tz);
  const next = addDaysKey(key, 1);
  return [start, zonedToUtc(next, "00:00", tz)];
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export function greeting(date: Date, tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(date));
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
