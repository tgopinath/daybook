import "server-only";
import type { Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { dayRange } from "@/lib/time";
import { OPEN, weekSummary } from "./context";
import type { InsightTask, Insights } from "./types";

const RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Deterministic, data-derived panel content. No LLM involved. */
export async function computeInsights(userId: string, tz: string, now = new Date()): Promise<Insights> {
  const [todayStart, todayEnd] = dayRange(now, tz);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const live = { deletedAt: null, archivedAt: null } as const;
  const select = { id: true, title: true, priority: true, status: true, dueDate: true, focusRank: true } as const;

  const [todayOpen, overdue, overdueCount, reminders, eventsToday, week, goals] = await Promise.all([
    db.task.findMany({ where: { userId, ...live, status: { in: OPEN }, OR: [{ dueDate: { gte: todayStart, lt: todayEnd } }, { focusRank: { not: null } }] }, select, take: 50 }),
    db.task.findMany({ where: { userId, ...live, status: { in: OPEN }, dueDate: { lt: todayStart } }, select, orderBy: { dueDate: "asc" }, take: 5 }),
    db.task.count({ where: { userId, ...live, status: { in: OPEN }, dueDate: { lt: todayStart } } }),
    db.reminder.findMany({
      where: { userId, ...live, status: "ACTIVE", OR: [{ remindAt: { lte: in24h } }, { snoozedUntil: { gte: now, lte: in24h } }] },
      orderBy: { remindAt: "asc" },
      take: 20,
    }),
    db.calendarEvent.count({ where: { userId, deletedAt: null, start: { lt: todayEnd }, end: { gt: todayStart } } }),
    weekSummary(userId, tz, now),
    db.goal.count({ where: { userId, ...live, status: "ACTIVE" } }),
  ]);

  const toItem = (t: (typeof todayOpen)[number]): InsightTask => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate?.toISOString() ?? null,
    overdue: !!t.dueDate && t.dueDate < todayStart,
    focusRank: t.focusRank,
  });

  const priorities = [...todayOpen, ...overdue.filter((o) => o.priority === "HIGH")]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => (a.focusRank ?? 9) - (b.focusRank ?? 9) || RANK[a.priority] - RANK[b.priority] || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
    .slice(0, 5)
    .map(toItem);

  const upcomingReminders = reminders
    .map((r) => {
      const at = r.snoozedUntil && r.snoozedUntil > now ? r.snoozedUntil : r.remindAt;
      return { id: r.id, title: r.title, kind: r.kind, at };
    })
    // Past-due fire times of recurring reminders are about to roll forward; show what's next.
    .filter((r) => r.at >= new Date(now.getTime() - 3600_000))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 6)
    .map((r) => ({ ...r, at: r.at.toISOString() }));

  const goalsWithProgress = week.goals;
  const avgGoalProgress = goalsWithProgress.length ? Math.round(goalsWithProgress.reduce((s, g) => s + g.progress, 0) / goalsWithProgress.length) : null;

  const lines: Insights["lines"] = [];
  const diff = week.completedThisWeek - week.completedLastWeek;
  const n = (x: number, w: string) => `${x} ${w}${x === 1 ? "" : "s"}`;
  if (week.completedThisWeek || week.completedLastWeek) {
    lines.push({
      tone: diff > 0 ? "positive" : diff < 0 ? "warning" : "neutral",
      text:
        diff > 0
          ? `You completed ${n(week.completedThisWeek, "task")} this week, ${diff} more than last week.`
          : diff < 0
            ? `You completed ${n(week.completedThisWeek, "task")} this week, ${-diff} fewer than last week.`
            : `You completed ${n(week.completedThisWeek, "task")} this week, same as last week.`,
    });
  } else lines.push({ tone: "neutral", text: "No tasks completed yet this week." });
  if (week.completionRate !== null) lines.push({ tone: week.completionRate >= 70 ? "positive" : week.completionRate >= 40 ? "neutral" : "warning", text: `${week.completionRate}% of this week's ${n(week.dueThisWeek, "task")} are done.` });
  if (week.habitRate !== null) lines.push({ tone: week.habitRate >= 70 ? "positive" : "neutral", text: `Habit check-ins are at ${week.habitRate}% this week.` });
  if (overdueCount) lines.push({ tone: "warning", text: `${n(overdueCount, "task")} overdue — clearing or rescheduling them keeps your list honest.` });
  const best = [...goalsWithProgress].filter((g) => (g.deltaThisWeek ?? 0) > 0).sort((a, b) => (b.deltaThisWeek ?? 0) - (a.deltaThisWeek ?? 0))[0];
  if (best) lines.push({ tone: "positive", text: `“${best.title}” moved forward ${best.deltaThisWeek}% this week (now ${best.progress}%).` });

  return {
    generatedAt: now.toISOString(),
    priorities,
    overdue: { count: overdueCount, items: overdue.map(toItem) },
    reminders: upcomingReminders,
    stats: {
      completedThisWeek: week.completedThisWeek,
      completedLastWeek: week.completedLastWeek,
      dueThisWeek: week.dueThisWeek,
      completionRate: week.completionRate ?? 0,
      habitRate: week.habitRate,
      activeGoals: goals,
      avgGoalProgress,
      eventsToday,
    },
    lines,
  };
}
