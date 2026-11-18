import "server-only";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/time";
import type { GoalBar, RangeKey, StatsData } from "@/components/dashboard/types";
import { bucketIndexer, buildBuckets, goalExpected, goalInclude, goalProgress, habitBucketStats, rangeBounds } from "./shared";

/** Loads everything the range-based charts need and computes the shared series. */
export async function loadSeries(userId: string, tz: string, range: RangeKey) {
  const now = new Date();
  const todayKey = dayKey(now, tz);
  const { granularity, buckets } = buildBuckets(range, todayKey);
  const [from, to] = rangeBounds(buckets, tz);
  const idx = bucketIndexer(buckets);

  const [completedTasks, createdTasks, habits, goals] = await Promise.all([
    // Completed history includes archived tasks (still real work), never deleted ones.
    db.task.findMany({
      where: { userId, deletedAt: null, status: "COMPLETED", completedAt: { gte: from, lt: to } },
      select: { id: true, completedAt: true, dueDate: true, priority: true, category: { select: { name: true, color: true } } },
    }),
    db.task.findMany({ where: { userId, deletedAt: null, createdAt: { gte: from, lt: to } }, select: { createdAt: true } }),
    db.habit.findMany({
      where: { userId, deletedAt: null, archivedAt: null },
      include: { entries: { select: { date: true, count: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.goal.findMany({ where: { userId, deletedAt: null, archivedAt: null, status: "ACTIVE" }, include: goalInclude, orderBy: { createdAt: "asc" } }),
  ]);

  const rows = buckets.map((b) => ({ key: b.key, label: b.label, fullLabel: b.fullLabel, completed: 0, created: 0, habitDone: 0, habitScheduled: 0, habitRate: null as number | null }));
  for (const t of completedTasks) {
    const i = idx(dayKey(t.completedAt!, tz));
    if (i >= 0) rows[i]!.completed++;
  }
  for (const t of createdTasks) {
    const i = idx(dayKey(t.createdAt, tz));
    if (i >= 0) rows[i]!.created++;
  }
  const habitStats = habits.map((h) => ({ habit: h, perBucket: habitBucketStats(h, buckets, todayKey, tz) }));
  for (const { perBucket } of habitStats) {
    perBucket.forEach((s, i) => {
      rows[i]!.habitDone += s.done;
      rows[i]!.habitScheduled += s.scheduled;
    });
  }
  for (const r of rows) r.habitRate = r.habitScheduled ? Math.round((r.habitDone / r.habitScheduled) * 100) : null;

  const goalBars: GoalBar[] = goals.map((g) => ({ id: g.id, title: g.title, color: g.color, progress: goalProgress(g), expected: goalExpected(g, now) }));

  const habitDone = rows.reduce((s, r) => s + r.habitDone, 0);
  const habitScheduled = rows.reduce((s, r) => s + r.habitScheduled, 0);
  const stats: StatsData = {
    range,
    granularity,
    buckets: rows,
    goals: goalBars,
    totals: {
      completed: completedTasks.length,
      created: createdTasks.length,
      habitDone,
      habitScheduled,
      habitRate: habitScheduled ? Math.round((habitDone / habitScheduled) * 100) : null,
    },
  };
  return { now, todayKey, from, to, buckets, stats, completedTasks, habitStats, goals };
}
