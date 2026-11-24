// Pure mood helpers shared by the mood tracker, weekly review and overview.
// No server or browser APIs: safe to import anywhere.
import { addDaysKey, weekdayOfKey } from "./time";
import { MOODS, moodMeta, type Mood } from "./moods";

export const MOOD_FACTORS = ["Work", "Sleep", "Health", "Family", "Friends", "Relationship", "Money", "Exercise", "Weather", "Food"] as const;

export const INTENSITY_LABELS = ["", "A little", "Mild", "Moderate", "Strong", "Very strong"] as const;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface MoodLike {
  date: string; // yyyy-MM-dd
  mood: string;
  intensity: number;
  factors: string[];
  loggedAt: Date | string;
}

const ts = (d: Date | string) => (typeof d === "string" ? Date.parse(d) : d.getTime());

export const moodScore = (mood: string): number | null => moodMeta(mood)?.score ?? null;

/** Normalise a factor label: trimmed, single-spaced, capitalised first letter, max 32 chars. */
export function normalizeFactor(f: string): string {
  const s = f.trim().replace(/\s+/g, " ").slice(0, 32);
  return s ? s[0]!.toUpperCase() + s.slice(1) : "";
}

/** Unique, normalised factors (case-insensitive), at most 12. */
export function cleanFactors(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const f = normalizeFactor(raw);
    if (!f || seen.has(f.toLowerCase())) continue;
    seen.add(f.toLowerCase());
    out.push(f);
    if (out.length >= 12) break;
  }
  return out;
}

/** Group check-ins by day key. */
export function groupByDay<T extends MoodLike>(entries: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of entries) {
    const list = m.get(e.date);
    if (list) list.push(e);
    else m.set(e.date, [e]);
  }
  return m;
}

/** The day's mood is its latest check-in. */
export function latestPerDay<T extends MoodLike>(entries: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of entries) {
    const cur = m.get(e.date);
    if (!cur || ts(e.loggedAt) > ts(cur.loggedAt)) m.set(e.date, e);
  }
  return m;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Average of mood scores (1–5), null when empty. */
export function averageScore(entries: Pick<MoodLike, "mood">[]): number | null {
  const scores = entries.map((e) => moodScore(e.mood)).filter((s): s is number => s != null);
  return scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

export function averageIntensity(entries: Pick<MoodLike, "intensity">[]): number | null {
  return entries.length ? round1(entries.reduce((a, e) => a + e.intensity, 0) / entries.length) : null;
}

/** Counts per mood in MOODS order (always all 8). */
export function distribution(entries: Pick<MoodLike, "mood">[]): { mood: Mood; label: string; emoji: string; color: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);
  return MOODS.map((m) => ({ mood: m.value, label: m.label, emoji: m.emoji, color: m.color, count: counts.get(m.value) ?? 0 }));
}

/** The most frequent mood (ties → the one logged most recently). */
export function dominantMood(entries: MoodLike[]): Mood | null {
  if (!entries.length) return null;
  const counts = new Map<string, { n: number; last: number }>();
  for (const e of entries) {
    const c = counts.get(e.mood) ?? { n: 0, last: 0 };
    c.n++;
    c.last = Math.max(c.last, ts(e.loggedAt));
    counts.set(e.mood, c);
  }
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0];
  return (best?.[0] as Mood) ?? null;
}

/** Top factors overall: [{ factor, count }]. */
export function topFactors(entries: Pick<MoodLike, "factors">[], limit = 6): { factor: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) for (const f of e.factors) m.set(f, (m.get(f) ?? 0) + 1);
  return [...m.entries()]
    .map(([factor, count]) => ({ factor, count }))
    .sort((a, b) => b.count - a.count || a.factor.localeCompare(b.factor))
    .slice(0, limit);
}

/** Most common factors for each mood that has entries. */
export function factorsByMood(entries: MoodLike[], limit = 3): { mood: Mood; count: number; factors: { factor: string; count: number }[] }[] {
  const by = new Map<string, MoodLike[]>();
  for (const e of entries) {
    const list = by.get(e.mood) ?? [];
    list.push(e);
    by.set(e.mood, list);
  }
  return MOODS.filter((m) => by.has(m.value)).map((m) => {
    const list = by.get(m.value)!;
    return { mood: m.value, count: list.length, factors: topFactors(list, limit) };
  });
}

/**
 * Check-in streaks from a set of day keys. The current streak counts back from
 * today; a missing today doesn't break it yet (counts from yesterday).
 */
export function checkinStreaks(days: Iterable<string>, todayKey: string): { current: number; longest: number } {
  const set = new Set(days);
  let current = 0;
  let k = set.has(todayKey) ? todayKey : addDaysKey(todayKey, -1);
  while (set.has(k)) {
    current++;
    k = addDaysKey(k, -1);
  }
  let longest = 0;
  const sorted = [...set].sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDaysKey(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest: Math.max(longest, current) };
}

/** Average day score per weekday (0 = Sunday) from per-day scores. */
export function weekdayAverages(dayScores: { key: string; score: number }[]): { weekday: number; name: string; avg: number | null; days: number }[] {
  const acc = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (const d of dayScores) {
    const w = weekdayOfKey(d.key);
    acc[w]!.sum += d.score;
    acc[w]!.n++;
  }
  return acc.map((a, i) => ({ weekday: i, name: WEEKDAY_NAMES[i]!, avg: a.n ? round1(a.sum / a.n) : null, days: a.n }));
}

/** Best and worst weekday (needs at least two weekdays with data that differ). */
export function bestWorstWeekday(avgs: ReturnType<typeof weekdayAverages>) {
  const withData = avgs.filter((a) => a.avg != null);
  if (withData.length < 2) return { best: null, worst: null };
  const sorted = [...withData].sort((a, b) => b.avg! - a.avg! || b.days - a.days);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  if (best.avg === worst.avg) return { best: null, worst: null };
  return { best: { name: best.name, avg: best.avg! }, worst: { name: worst.name, avg: worst.avg! } };
}

/** Per-day average score of all that day's check-ins. */
export function dayScores(entries: MoodLike[]): { key: string; score: number; count: number }[] {
  return [...groupByDay(entries).entries()]
    .map(([key, list]) => ({ key, score: averageScore(list) ?? 0, count: list.length }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Gentle words for a score (1–5). */
export function scoreWord(score: number | null): string {
  if (score == null) return "—";
  if (score >= 4.5) return "Great";
  if (score >= 3.5) return "Good";
  if (score >= 2.5) return "Okay";
  if (score >= 1.5) return "Low";
  return "Rough";
}
