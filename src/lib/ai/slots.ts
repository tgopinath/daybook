// Pure time-slot math shared by the planner UI, the schedule tool and the plan endpoint.

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const fromMin = (min: number) => {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const isHHMM = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-4]):[0-5]\d$/.test(v);

/**
 * Free gaps inside [workStart, workEnd] that aren't covered by `busy`.
 * `notBefore` (HH:mm) trims the start, e.g. "now" for today.
 */
export function freeSlots(
  busy: { start: string; end: string }[],
  workStart: string,
  workEnd: string,
  opts: { minMinutes?: number; notBefore?: string | null } = {},
): { start: string; end: string; minutes: number }[] {
  const min = opts.minMinutes ?? 15;
  let from = toMin(workStart);
  const to = toMin(workEnd);
  if (opts.notBefore) from = Math.max(from, Math.ceil(toMin(opts.notBefore) / 5) * 5);
  if (to <= from) return [];
  const intervals = busy
    .map((b) => [Math.max(toMin(b.start), from), Math.min(toMin(b.end), to)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const out: { start: string; end: string; minutes: number }[] = [];
  let cursor = from;
  for (const [s, e] of intervals) {
    if (s - cursor >= min) out.push({ start: fromMin(cursor), end: fromMin(s), minutes: s - cursor });
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= min) out.push({ start: fromMin(cursor), end: fromMin(to), minutes: to - cursor });
  return out;
}

/** "9:30 AM" from "09:30". */
export function formatHHMM(hhmm: string): string {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}
