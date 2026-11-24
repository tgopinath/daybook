import { db } from "@/lib/db";
import { query, route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey } from "@/lib/time";
import {
  averageIntensity,
  averageScore,
  bestWorstWeekday,
  checkinStreaks,
  dayScores,
  distribution,
  dominantMood,
  factorsByMood,
  latestPerDay,
  topFactors,
  weekdayAverages,
} from "@/lib/mood";
import type { MoodRange, MoodStats } from "@/components/mood/types";
import type { Mood } from "@/lib/moods";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseRange = (v: string | null): MoodRange => (v === "7d" || v === "30d" || v === "90d" || v === "12m" ? v : "30d");

const dayLabel = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  const wd = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return { short: `${d} ${MONTHS[m! - 1]}`, wd: WD[wd]!, full: `${WD[wd]} ${d} ${MONTHS[m! - 1]}` };
};

/** Mood trends for ?range=7d|30d|90d|12m (day keys in the caller's timezone). */
export const GET = route(async ({ req, user }) => {
  const range = parseRange(query(req).get("range"));
  const todayKey = dayKey(new Date(), tzOf(req));
  let from: string;
  if (range === "12m") {
    const [y, m] = todayKey.split("-").map(Number);
    from = new Date(Date.UTC(y!, m! - 12, 1)).toISOString().slice(0, 10);
  } else {
    from = addDaysKey(todayKey, -(Number(range.replace("d", "")) - 1));
  }

  const [entries, allDays, factorRows] = await Promise.all([
    db.moodEntry.findMany({
      where: { userId: user.id, date: { gte: from, lte: todayKey } },
      select: { date: true, mood: true, intensity: true, factors: true, loggedAt: true },
      orderBy: { loggedAt: "asc" },
    }),
    db.moodEntry.findMany({ where: { userId: user.id }, distinct: ["date"], select: { date: true } }),
    db.moodEntry.findMany({ where: { userId: user.id }, select: { factors: true }, orderBy: { loggedAt: "desc" }, take: 500 }),
  ]);

  const perDay = dayScores(entries);
  const latest = latestPerDay(entries);
  const series: MoodStats["series"] = [];
  if (range === "12m") {
    const byMonth = new Map<string, { sum: number; n: number; count: number }>();
    for (const d of perDay) {
      const k = d.key.slice(0, 7);
      const acc = byMonth.get(k) ?? { sum: 0, n: 0, count: 0 };
      acc.sum += d.score;
      acc.n++;
      acc.count += d.count;
      byMonth.set(k, acc);
    }
    const [y, m] = todayKey.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(Date.UTC(y!, m! - 1 - i, 1));
      const k = dt.toISOString().slice(0, 7);
      const acc = byMonth.get(k);
      series.push({
        key: k,
        label: MONTHS[dt.getUTCMonth()]!,
        fullLabel: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`,
        score: acc ? Math.round((acc.sum / acc.n) * 10) / 10 : null,
        count: acc?.count ?? 0,
        mood: null,
      });
    }
  } else {
    const map = new Map(perDay.map((d) => [d.key, d]));
    for (let k = from; k <= todayKey; k = addDaysKey(k, 1)) {
      const d = map.get(k);
      const l = dayLabel(k);
      series.push({
        key: k,
        label: range === "7d" ? l.wd : l.short,
        fullLabel: l.full,
        score: d ? d.score : null,
        count: d?.count ?? 0,
        mood: (latest.get(k)?.mood as Mood | undefined) ?? null,
      });
    }
  }

  const weekdays = weekdayAverages(perDay);
  const { best, worst } = bestWorstWeekday(weekdays);
  const known = topFactors(factorRows, 30).map((f) => f.factor);

  const stats: MoodStats = {
    range,
    from,
    to: todayKey,
    granularity: range === "12m" ? "month" : "day",
    checkins: entries.length,
    daysLogged: perDay.length,
    avgScore: averageScore(entries),
    avgIntensity: averageIntensity(entries),
    dominant: dominantMood(entries),
    streak: checkinStreaks(allDays.map((d) => d.date), todayKey),
    series,
    distribution: distribution(entries),
    topFactors: topFactors(entries),
    factorsByMood: factorsByMood(entries),
    weekdays,
    bestWeekday: best,
    worstWeekday: worst,
    knownFactors: known,
  };
  return stats;
});

