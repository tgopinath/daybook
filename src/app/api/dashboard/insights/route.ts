import { db } from "@/lib/db";
import { query, route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";
import type { Finding, InsightsData, PriorityKey } from "@/components/dashboard/types";
import { loadSeries } from "../_lib/series";
import { currentStreak, diffDays, localHour, parseRange, pct, PRIORITY_LABEL, WEEKDAYS } from "../_lib/shared";

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RANGE_PHRASE = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" } as const;
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 || h === 24 ? "AM" : "PM"}`;

export const GET = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const range = parseRange(query(req).get("range"));
  const userId = user.id;
  const { todayKey, from, to, buckets, stats, completedTasks, habitStats } = await loadSeries(userId, tz, range);
  const startKey = buckets[0]!.startKey;
  const days = diffDays(startKey, todayKey) + 1;
  const prevFrom = zonedToUtc(addDaysKey(startKey, -days), "00:00", tz);
  const stale = zonedToUtc(addDaysKey(todayKey, -3), "00:00", tz);

  const [settings, dueInRange, prevCompleted, openByPriority, staleOverdue] = await Promise.all([
    db.userSettings.findUnique({ where: { userId }, select: { weekStart: true } }),
    db.task.findMany({ where: { userId, deletedAt: null, status: { not: "CANCELLED" }, dueDate: { gte: from, lt: to } }, select: { status: true } }),
    db.task.count({ where: { userId, deletedAt: null, status: "COMPLETED", completedAt: { gte: prevFrom, lt: from } } }),
    db.task.groupBy({ by: ["priority"], where: { userId, deletedAt: null, archivedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }, _count: { _all: true } }),
    db.task.count({ where: { userId, deletedAt: null, archivedAt: null, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, dueDate: { lt: stale } } }),
  ]);

  // ---- KPIs ----
  const completed = completedTasks.length;
  const dueDone = dueInRange.filter((t) => t.status === "COMPLETED").length;
  const withDue = completedTasks.filter((t) => t.dueDate);
  // On time = finished no later than the local day it was due.
  const onTime = withDue.filter((t) => dayKey(t.completedAt!, tz) <= dayKey(t.dueDate!, tz)).length;

  const streaks = habitStats.map(({ habit }) => ({ habit, streak: currentStreak(habit, todayKey, tz) }));
  const best = [...streaks].sort((a, b) => b.streak - a.streak)[0];

  const goalRows = stats.goals.map((g) => ({
    ...g,
    status: (g.expected == null ? "no-deadline" : g.progress >= g.expected + 10 ? "ahead" : g.progress >= g.expected ? "on-track" : "behind") as InsightsData["goals"][number]["status"],
  }));
  const withDeadline = goalRows.filter((g) => g.expected != null);

  // ---- Breakdowns ----
  const weekStart = settings?.weekStart ?? 1;
  const wdCounts = Array<number>(7).fill(0);
  const hourCounts = Array<number>(24).fill(0);
  const catMap = new Map<string, { name: string; color: string; count: number }>();
  const prioCompleted: Record<PriorityKey, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const t of completedTasks) {
    const k = dayKey(t.completedAt!, tz);
    wdCounts[weekdayOfKey(k)]!++;
    hourCounts[localHour(t.completedAt!, tz) % 24]!++;
    const name = t.category?.name ?? "Uncategorized";
    const c = catMap.get(name) ?? { name, color: t.category?.color ?? "#9a9ea6", count: 0 };
    c.count++;
    catMap.set(name, c);
    prioCompleted[t.priority]++;
  }
  const byWeekday = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7).map((d) => ({ day: WEEKDAYS[d]!, count: wdCounts[d]! }));
  const byCategory = [...catMap.values()].sort((a, b) => b.count - a.count);
  const openMap = new Map(openByPriority.map((g) => [g.priority, g._count._all]));
  const byPriority = (["HIGH", "MEDIUM", "LOW"] as const).map((p) => ({ priority: p, label: PRIORITY_LABEL[p], completed: prioCompleted[p], open: openMap.get(p) ?? 0 }));

  const habits = habitStats.map(({ habit, perBucket }) => {
    const done = perBucket.reduce((s, b) => s + b.done, 0);
    const sched = perBucket.reduce((s, b) => s + b.scheduled, 0);
    return {
      id: habit.id,
      name: habit.name,
      color: habit.color,
      rate: sched ? Math.round((done / sched) * 100) : null,
      scheduled: sched,
      streak: streaks.find((s) => s.habit.id === habit.id)?.streak ?? 0,
      cells: perBucket.map((b, i) => ({ key: buckets[i]!.key, label: buckets[i]!.fullLabel, rate: b.scheduled ? Math.round((b.done / b.scheduled) * 100) : null })),
    };
  });

  // ---- Findings (deterministic, data-backed) ----
  const findings: Finding[] = [];
  const phrase = RANGE_PHRASE[range];
  if (completed >= 5) {
    const top = wdCounts.indexOf(Math.max(...wdCounts));
    findings.push({ id: "weekday", tone: "neutral", text: `Most productive day: ${WEEKDAYS_LONG[top]} (${pct(wdCounts[top]!, completed)}% of completions)` });
  }
  if (prevCompleted > 0) {
    const change = Math.round(((completed - prevCompleted) / prevCompleted) * 100);
    if (change !== 0)
      findings.push({
        id: "trend",
        tone: change > 0 ? "positive" : "warning",
        text: `You completed ${completed} ${completed === 1 ? "task" : "tasks"} in the last ${phrase}, ${Math.abs(change)}% ${change > 0 ? "more" : "fewer"} than the ${phrase} before`,
      });
    else findings.push({ id: "trend", tone: "neutral", text: `You completed ${completed} tasks in the last ${phrase}, the same as the ${phrase} before` });
  } else if (completed > 0) {
    findings.push({ id: "trend", tone: "positive", text: `You completed ${completed} ${completed === 1 ? "task" : "tasks"} in the last ${phrase}` });
  }
  if (staleOverdue > 0)
    findings.push({ id: "overdue", tone: "warning", text: `${staleOverdue} ${staleOverdue === 1 ? "task has" : "tasks have"} been overdue for more than 3 days`, href: "/tasks" });
  if (withDue.length >= 3) {
    const r = pct(onTime, withDue.length);
    findings.push({ id: "ontime", tone: r >= 80 ? "positive" : r < 50 ? "warning" : "neutral", text: `${r}% of completed tasks with a due date were finished on time` });
  }
  if (completed >= 5 && byCategory[0]) {
    findings.push({ id: "category", tone: "neutral", text: `${byCategory[0].name} accounts for ${pct(byCategory[0].count, completed)}% of completed tasks` });
  }
  if (completed >= 5) {
    const h = hourCounts.indexOf(Math.max(...hourCounts));
    findings.push({ id: "hour", tone: "neutral", text: `Most tasks get done between ${hourLabel(h)} and ${hourLabel(h + 1)}` });
  }
  if (best && best.streak >= 2) {
    findings.push({ id: "streak", tone: "positive", text: `${best.habit.name} is on a ${best.streak}-day streak, your longest right now`, href: "/habits" });
  }
  const rated = habits.filter((h) => h.rate != null && h.scheduled >= 5);
  if (rated.length >= 2) {
    const sorted = [...rated].sort((a, b) => b.rate! - a.rate!);
    const top = sorted[0]!;
    const low = sorted[sorted.length - 1]!;
    findings.push({ id: "habit-top", tone: "positive", text: `${top.name} is your most consistent habit (${top.rate}% of scheduled days)`, href: "/habits" });
    if (low.rate! < 60) findings.push({ id: "habit-low", tone: "warning", text: `${low.name} was done on only ${low.rate}% of scheduled days`, href: "/habits" });
  }
  for (const g of goalRows) {
    if (g.expected != null && g.expected - g.progress >= 10)
      findings.push({ id: `goal-${g.id}`, tone: "warning", text: `${g.title} is ${g.expected - g.progress} points behind schedule (${g.progress}% done, ${g.expected}% expected)`, href: `/goals/${g.id}` });
  }
  const ahead = goalRows.filter((g) => g.status === "ahead");
  if (ahead.length) findings.push({ id: "goals-ahead", tone: "positive", text: `${ahead.map((g) => g.title).join(", ")} ${ahead.length === 1 ? "is" : "are"} ahead of schedule`, href: "/goals" });

  const data: InsightsData = {
    range,
    granularity: stats.granularity,
    days,
    kpis: {
      completed,
      prevCompleted,
      completionRate: dueInRange.length ? pct(dueDone, dueInRange.length) : null,
      dueInRange: dueInRange.length,
      avgPerDay: Math.round((completed / days) * 10) / 10,
      onTimeRate: withDue.length ? pct(onTime, withDue.length) : null,
      onTimeBase: withDue.length,
      bestStreak: best?.streak ?? 0,
      bestStreakHabit: best && best.streak > 0 ? best.habit.name : null,
      goalsOnTrack: withDeadline.filter((g) => g.status !== "behind").length,
      goalsWithDeadline: withDeadline.length,
    },
    byWeekday,
    byCategory,
    byPriority,
    trend: stats.buckets.map((b) => ({ key: b.key, label: b.label, fullLabel: b.fullLabel, created: b.created, completed: b.completed })),
    habits: habits.map(({ scheduled: _s, ...h }) => h),
    goals: goalRows,
    findings,
  };
  return data;
});
