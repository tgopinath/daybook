import "server-only";
import type { Priority, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { addDaysKey, dayKey, dayRange, weekdayOfKey, zonedToUtc } from "@/lib/time";
import { freeSlots, toMin } from "./slots";
import type { DaySchedule } from "./types";

export const OPEN: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS"];
const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const live = { deletedAt: null, archivedAt: null } as const;

/** HH:mm of an instant in tz. */
export function hhmm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function nowLabel(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(now);
}

export async function getSettings(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId } });
  return {
    workStart: s?.workStart ?? "09:00",
    workEnd: s?.workEnd ?? "18:00",
    weekStart: s?.weekStart ?? 1,
    dailyFocus: s?.dailyFocus ?? null,
    dailyFocusDate: s?.dailyFocusDate ?? null,
    timezone: s?.timezone ?? "UTC",
  };
}

/** Accepts "yyyy-MM-dd" or an ISO instant; returns the day key in tz. */
export function toDayKey(v: string | undefined | null, tz: string, fallback = new Date()): string {
  if (!v) return dayKey(fallback, tz);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? dayKey(fallback, tz) : dayKey(d, tz);
}

export function goalProgress(g: { targetValue: number | null; currentValue: number; milestones?: { done: boolean }[]; tasks?: { status: TaskStatus }[] }): number {
  if (g.targetValue && g.targetValue > 0) return Math.max(0, Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)));
  if (g.milestones?.length) return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
  const tasks = g.tasks?.filter((t) => t.status !== "CANCELLED") ?? [];
  if (tasks.length) return Math.round((tasks.filter((t) => t.status === "COMPLETED").length / tasks.length) * 100);
  return 0;
}

/** Start key of the week containing `key` given settings.weekStart (0 = Sunday). */
export function weekStartKey(key: string, weekStart: number): string {
  const wd = weekdayOfKey(key);
  const back = (wd - weekStart + 7) % 7;
  return addDaysKey(key, -back);
}

/* ------------------------------------------------------------------ */
/* Day schedule (planner, get_schedule tool, plan endpoint)            */
/* ------------------------------------------------------------------ */

export async function getDaySchedule(userId: string, day: string, tz: string, now = new Date()): Promise<DaySchedule> {
  const settings = await getSettings(userId);
  const start = zonedToUtc(day, "00:00", tz);
  const end = zonedToUtc(addDaysKey(day, 1), "00:00", tz);
  const today = dayKey(now, tz);
  const isToday = day === today;
  const [todayStart] = dayRange(now, tz);

  const [events, dayTasks] = await Promise.all([
    db.calendarEvent.findMany({
      where: { userId, deletedAt: null, start: { lt: end }, end: { gt: start } },
      orderBy: { start: "asc" },
      take: 100,
    }),
    db.task.findMany({
      where: {
        userId,
        ...live,
        status: { in: OPEN },
        OR: [
          { dueDate: { gte: start, lt: end } },
          // Overdue open tasks are offered for scheduling on today's plan.
          ...(isToday ? [{ dueDate: { lt: todayStart } }] : []),
        ],
      },
      include: { goal: { select: { title: true } } },
      orderBy: [{ dueDate: "asc" }],
      take: 200,
    }),
  ]);

  const clampStart = (d: Date) => (d < start ? "00:00" : hhmm(d, tz));
  const clampEnd = (d: Date) => (d >= end ? "24:00" : hhmm(d, tz));

  const ev = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.allDay ? "00:00" : clampStart(e.start),
    end: e.allDay ? "24:00" : clampEnd(e.end),
    allDay: e.allDay,
    kind: e.kind,
    color: e.color,
  }));

  const inDay = (t: (typeof dayTasks)[number]) => !!t.dueDate && t.dueDate >= start && t.dueDate < end;
  const timed = dayTasks
    .filter((t) => inDay(t) && t.startTime)
    .map((t) => {
      const s = t.startTime!;
      const e = t.endTime && toMin(t.endTime) > toMin(s) ? t.endTime : addMinutes(s, 30);
      return { id: t.id, title: t.title, start: s, end: e, priority: t.priority, status: t.status };
    })
    .sort((a, b) => toMin(a.start) - toMin(b.start));

  const unscheduled = dayTasks
    .filter((t) => !(inDay(t) && t.startTime))
    .map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
      overdue: !!t.dueDate && t.dueDate < todayStart,
      goal: t.goal?.title ?? null,
    }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Number(b.overdue) - Number(a.overdue));

  const busy = [...ev.filter((e) => !e.allDay), ...timed];
  const slots = day < today ? [] : freeSlots(busy, settings.workStart, settings.workEnd, { notBefore: isToday ? hhmm(now, tz) : null });

  return {
    date: day,
    isToday,
    now: isToday ? hhmm(now, tz) : null,
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    events: ev,
    timedTasks: timed,
    freeSlots: slots,
    unscheduled,
    focus: settings.dailyFocusDate === day ? settings.dailyFocus : null,
  };
}

function addMinutes(t: string, n: number) {
  const m = Math.min(24 * 60, toMin(t) + n);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Snapshot for the system prompt / get_overview                       */
/* ------------------------------------------------------------------ */

export async function buildSnapshot(userId: string, tz: string, now = new Date()) {
  const settings = await getSettings(userId);
  const today = dayKey(now, tz);
  const [todayStart, todayEnd] = dayRange(now, tz);
  const weekAhead = zonedToUtc(addDaysKey(today, 8), "00:00", tz);
  const in24h = new Date(now.getTime() + 24 * 3600_000);

  const taskSelect = { id: true, title: true, dueDate: true, startTime: true, endTime: true, priority: true, status: true, focusRank: true, goal: { select: { title: true } } } as const;

  const [todayTasks, overdue, upcoming, events, goals, reminders, habits, user] = await Promise.all([
    db.task.findMany({ where: { userId, ...live, dueDate: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } }, select: taskSelect, orderBy: [{ focusRank: "asc" }, { dueDate: "asc" }], take: 30 }),
    db.task.findMany({ where: { userId, ...live, dueDate: { lt: todayStart }, status: { in: OPEN } }, select: taskSelect, orderBy: { dueDate: "asc" }, take: 20 }),
    db.task.findMany({ where: { userId, ...live, dueDate: { gte: todayEnd, lt: weekAhead }, status: { in: OPEN } }, select: taskSelect, orderBy: { dueDate: "asc" }, take: 20 }),
    db.calendarEvent.findMany({ where: { userId, deletedAt: null, start: { lt: todayEnd }, end: { gt: todayStart } }, orderBy: { start: "asc" }, take: 20 }),
    db.goal.findMany({
      where: { userId, ...live, status: "ACTIVE" },
      include: { milestones: { select: { title: true, done: true, dueDate: true }, orderBy: { sortOrder: "asc" } }, tasks: { where: { deletedAt: null }, select: { status: true } } },
      orderBy: { targetDate: "asc" },
      take: 12,
    }),
    db.reminder.findMany({
      where: { userId, ...live, status: "ACTIVE", OR: [{ remindAt: { lte: in24h } }, { snoozedUntil: { lte: in24h, gte: now } }] },
      orderBy: { remindAt: "asc" },
      take: 15,
    }),
    db.habit.findMany({ where: { userId, ...live }, include: { entries: { where: { date: today } } }, take: 20 }),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);

  const fmtTask = (t: (typeof todayTasks)[number]) => ({
    id: t.id,
    title: t.title,
    due: t.dueDate ? `${dayKey(t.dueDate, tz)} ${hhmm(t.dueDate, tz)}` : null,
    time: t.startTime ? `${t.startTime}${t.endTime ? `-${t.endTime}` : ""}` : null,
    priority: t.priority,
    status: t.status,
    ...(t.focusRank ? { focusRank: t.focusRank } : {}),
    ...(t.goal ? { goal: t.goal.title } : {}),
  });

  const todayWd = weekdayOfKey(today);
  return {
    user: user?.name ?? null,
    now: nowLabel(now, tz),
    today,
    timezone: tz,
    workingHours: `${settings.workStart}-${settings.workEnd}`,
    dailyFocus: settings.dailyFocusDate === today ? settings.dailyFocus : null,
    tasksToday: todayTasks.map(fmtTask),
    overdueTasks: overdue.map(fmtTask),
    upcomingTasks: upcoming.map(fmtTask),
    eventsToday: events.map((e) => ({ id: e.id, title: e.title, time: e.allDay ? "all day" : `${hhmm(e.start, tz)}-${hhmm(e.end, tz)}`, kind: e.kind, ...(e.location ? { location: e.location } : {}) })),
    activeGoals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      category: g.category,
      progress: `${goalProgress(g)}%`,
      ...(g.targetValue ? { value: `${g.currentValue}/${g.targetValue}${g.unit ? ` ${g.unit}` : ""}` } : {}),
      targetDate: g.targetDate ? dayKey(g.targetDate, tz) : null,
      nextMilestone: g.milestones.find((m) => !m.done)?.title ?? null,
    })),
    remindersNext24h: reminders.map((r) => {
      const at = r.snoozedUntil && r.snoozedUntil > now ? r.snoozedUntil : r.remindAt;
      return { id: r.id, title: r.title, at: `${dayKey(at, tz)} ${hhmm(at, tz)}`, recurrence: r.recurrence, ...(r.intervalMinutes ? { intervalMinutes: r.intervalMinutes } : {}) };
    }),
    habitsToday: habits
      .filter((h) => h.daysOfWeek.includes(todayWd))
      .map((h) => ({ id: h.id, name: h.name, done: (h.entries[0]?.count ?? 0) >= h.targetPerDay })),
  };
}

export type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>;

/** Compact, line-oriented rendering for the system prompt. */
export function snapshotToText(s: Snapshot): string {
  const lines: string[] = [];
  const task = (t: Snapshot["tasksToday"][number]) =>
    `- [${t.id}] ${t.title} · ${t.priority}${t.status === "COMPLETED" ? " · done" : t.status === "IN_PROGRESS" ? " · in progress" : ""}${t.time ? ` · ${t.time}` : t.due ? ` · due ${t.due}` : ""}${t.goal ? ` · goal: ${t.goal}` : ""}`;
  lines.push(`Now: ${s.now} (${s.timezone}). Today is ${s.today}. Working hours ${s.workingHours}.`);
  if (s.user) lines.push(`User: ${s.user}`);
  if (s.dailyFocus) lines.push(`Daily focus: ${s.dailyFocus}`);
  lines.push(`Tasks today (${s.tasksToday.length}):`, ...(s.tasksToday.length ? s.tasksToday.map(task) : ["- none"]));
  if (s.overdueTasks.length) lines.push(`Overdue (${s.overdueTasks.length}):`, ...s.overdueTasks.map(task));
  if (s.upcomingTasks.length) lines.push(`Upcoming 7 days:`, ...s.upcomingTasks.slice(0, 12).map(task));
  lines.push(`Events today:`, ...(s.eventsToday.length ? s.eventsToday.map((e) => `- [${e.id}] ${e.time} ${e.title} (${e.kind})`) : ["- none"]));
  if (s.activeGoals.length)
    lines.push(`Active goals:`, ...s.activeGoals.map((g) => `- [${g.id}] ${g.title} (${g.category}) · ${g.progress}${g.value ? ` · ${g.value}` : ""}${g.targetDate ? ` · target ${g.targetDate}` : ""}${g.nextMilestone ? ` · next: ${g.nextMilestone}` : ""}`));
  if (s.remindersNext24h.length) lines.push(`Reminders next 24h:`, ...s.remindersNext24h.map((r) => `- ${r.at} ${r.title}`));
  if (s.habitsToday.length) lines.push(`Habits today: ${s.habitsToday.map((h) => `${h.name}${h.done ? " ✓" : ""}`).join(", ")}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Week summary (get_week_summary tool, insights)                      */
/* ------------------------------------------------------------------ */

export async function weekSummary(userId: string, tz: string, now = new Date()) {
  const settings = await getSettings(userId);
  const today = dayKey(now, tz);
  const ws = weekStartKey(today, settings.weekStart);
  const weekStart = zonedToUtc(ws, "00:00", tz);
  const weekEnd = zonedToUtc(addDaysKey(ws, 7), "00:00", tz);
  const lastWeekStart = zonedToUtc(addDaysKey(ws, -7), "00:00", tz);

  const [completedThis, completedLast, dueThisWeek, pending, goals, habits] = await Promise.all([
    db.task.findMany({ where: { userId, deletedAt: null, status: "COMPLETED", completedAt: { gte: weekStart, lt: weekEnd } }, select: { id: true, title: true, priority: true, completedAt: true }, orderBy: { completedAt: "desc" }, take: 100 }),
    db.task.count({ where: { userId, deletedAt: null, status: "COMPLETED", completedAt: { gte: lastWeekStart, lt: weekStart } } }),
    db.task.findMany({ where: { userId, deletedAt: null, dueDate: { gte: weekStart, lt: weekEnd }, status: { not: "CANCELLED" } }, select: { status: true } }),
    db.task.findMany({ where: { userId, ...live, status: { in: OPEN }, dueDate: { lt: weekEnd } }, select: { id: true, title: true, priority: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 30 }),
    db.goal.findMany({
      where: { userId, ...live, status: "ACTIVE" },
      include: {
        milestones: { select: { done: true, completedAt: true } },
        tasks: { where: { deletedAt: null }, select: { status: true, completedAt: true } },
        progressLogs: { where: { createdAt: { lt: weekStart } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 20,
    }),
    db.habit.findMany({ where: { userId, ...live }, include: { entries: { where: { date: { gte: ws, lt: addDaysKey(ws, 7) } } } }, take: 30 }),
  ]);

  const daysSoFar = Math.min(7, Math.max(1, Math.round((zonedToUtc(today, "00:00", tz).getTime() - weekStart.getTime()) / 86400_000) + 1));
  let habitExpected = 0;
  let habitDone = 0;
  const habitRows = habits.map((h) => {
    let expected = 0;
    for (let i = 0; i < daysSoFar; i++) if (h.daysOfWeek.includes(weekdayOfKey(addDaysKey(ws, i)))) expected++;
    const done = h.entries.filter((e) => e.count >= h.targetPerDay).length;
    habitExpected += expected;
    habitDone += Math.min(done, expected);
    return { name: h.name, done, expected };
  });

  const goalRows = goals.map((g) => {
    const progress = goalProgress(g);
    let delta: number | null = null;
    if (g.targetValue && g.targetValue > 0) {
      const before = g.progressLogs[0]?.value ?? (g.startDate >= weekStart ? 0 : null);
      if (before !== null) delta = Math.round(((g.currentValue - before) / g.targetValue) * 100);
    } else {
      const done = g.tasks.filter((t) => t.completedAt && t.completedAt >= weekStart).length + g.milestones.filter((m) => m.completedAt && m.completedAt >= weekStart).length;
      const total = g.milestones.length || g.tasks.filter((t) => t.status !== "CANCELLED").length;
      if (total) delta = Math.round((done / total) * 100);
    }
    return { id: g.id, title: g.title, progress, deltaThisWeek: delta };
  });

  const dueDone = dueThisWeek.filter((t) => t.status === "COMPLETED").length;
  return {
    weekStart: ws,
    weekEnd: addDaysKey(ws, 6),
    completedThisWeek: completedThis.length,
    completedLastWeek: completedLast,
    completedTasks: completedThis.slice(0, 20).map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    dueThisWeek: dueThisWeek.length,
    dueThisWeekCompleted: dueDone,
    completionRate: dueThisWeek.length ? Math.round((dueDone / dueThisWeek.length) * 100) : null,
    pendingTasks: pending.map((t) => ({ id: t.id, title: t.title, priority: t.priority, due: t.dueDate ? dayKey(t.dueDate, tz) : null, overdue: !!t.dueDate && t.dueDate < zonedToUtc(today, "00:00", tz) })),
    goals: goalRows,
    habits: habitRows,
    habitRate: habitExpected ? Math.round((habitDone / habitExpected) * 100) : null,
  };
}
