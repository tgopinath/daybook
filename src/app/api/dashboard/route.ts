import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey, dayRange, greeting, zonedToUtc } from "@/lib/time";
import type { DashboardData, FocusTask, ReminderOccurrence, UpcomingDay, UpcomingItem } from "@/components/dashboard/types";
import {
  currentStreak,
  eventOccurrences,
  goalExpected,
  goalInclude,
  goalProgress,
  habitDoneMap,
  hhmmLabel,
  isScheduled,
  localHHmm,
  longDayLabel,
  pct,
  PRIORITY_LABEL,
  relDayLabel,
  reminderOccurrences,
  timeLabel,
} from "./_lib/shared";

const OPEN = ["NOT_STARTED", "IN_PROGRESS"] as const;
const UPCOMING_DAYS = 7;

const focusSelect = {
  id: true,
  title: true,
  priority: true,
  status: true,
  dueDate: true,
  startTime: true,
  focusRank: true,
  category: { select: { name: true, color: true } },
  goal: { select: { title: true } },
} satisfies Prisma.TaskSelect;

type FocusRow = Prisma.TaskGetPayload<{ select: typeof focusSelect }>;

export const GET = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const now = new Date();
  const todayKey = dayKey(now, tz);
  const [todayStart, todayEnd] = dayRange(now, tz);
  const windowEnd = zonedToUtc(addDaysKey(todayKey, UPCOMING_DAYS), "00:00", tz);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const userId = user.id;
  const live = { userId, deletedAt: null, archivedAt: null };

  const [settings, todayTasks, overdue, focusRows, goals, reminders, habits, events, noteCount, latestNote, upcomingTasks] = await Promise.all([
    db.userSettings.findUnique({ where: { userId }, select: { dailyFocus: true, dailyFocusDate: true } }),
    db.task.findMany({ where: { ...live, dueDate: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } }, select: { id: true, status: true } }),
    db.task.count({ where: { ...live, dueDate: { lt: todayStart }, status: { in: [...OPEN] } } }),
    db.task.findMany({
      where: { ...live, focusRank: { not: null }, OR: [{ status: { in: [...OPEN] } }, { status: "COMPLETED", completedAt: { gte: todayStart } }] },
      orderBy: [{ focusRank: "asc" }, { updatedAt: "desc" }],
      take: 3,
      select: focusSelect,
    }),
    db.goal.findMany({ where: { ...live, status: "ACTIVE" }, include: goalInclude, orderBy: { createdAt: "asc" } }),
    db.reminder.findMany({ where: { ...live, status: "ACTIVE" } }),
    db.habit.findMany({ where: live, include: { entries: { select: { date: true, count: true } } } }),
    db.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { start: { lt: new Date(now.getTime() + 31 * 86400_000) }, end: { gt: todayStart } },
          { recurrence: { in: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] }, start: { lt: windowEnd } },
        ],
      },
    }),
    db.note.count({ where: live }),
    db.note.findFirst({ where: live, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, updatedAt: true } }),
    db.task.findMany({
      where: { ...live, status: { in: [...OPEN] }, dueDate: { gte: todayStart, lt: windowEnd } },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, dueDate: true, startTime: true, endTime: true, priority: true, category: { select: { color: true } } },
    }),
  ]);

  // ---- Focus ----
  const toFocus = (t: FocusRow): FocusTask => {
    const due = t.dueDate;
    const dueKey = due ? dayKey(due, tz) : null;
    const overdueTask = !!due && due < todayStart && t.status !== "COMPLETED";
    let dueLabel: string | null = null;
    if (due && dueKey) {
      const hm = localHHmm(due, tz);
      const time = t.startTime ? hhmmLabel(t.startTime) : hm === "00:00" || hm === "23:59" ? null : timeLabel(due, tz);
      dueLabel = overdueTask ? `Overdue · ${relDayLabel(dueKey, todayKey)}` : [relDayLabel(dueKey, todayKey), time].filter(Boolean).join(" · ");
    }
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueDate: due?.toISOString() ?? null,
      dueLabel,
      overdue: overdueTask,
      focusRank: t.focusRank,
      category: t.category,
      goalTitle: t.goal?.title ?? null,
    };
  };
  const focusTasks = focusRows.map(toFocus);
  let suggested: FocusTask[] = [];
  if (focusTasks.length < 3) {
    const rows = await db.task.findMany({
      where: { ...live, focusRank: null, status: { in: [...OPEN] }, dueDate: { lt: todayEnd } },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 3 - focusTasks.length,
      select: focusSelect,
    });
    suggested = rows.map(toFocus);
  }

  // ---- Reminders ----
  const occ = (r: (typeof reminders)[number], at: Date): ReminderOccurrence => {
    const k = dayKey(at, tz);
    return { id: r.id, title: r.title, kind: r.kind, at: at.toISOString(), time: timeLabel(at, tz), dayKey: k, dayLabel: relDayLabel(k, todayKey) };
  };
  const next24 = reminders
    .map((r) => ({ r, first: reminderOccurrences(r, now, in24h, 1)[0] }))
    .filter((x): x is { r: (typeof reminders)[number]; first: Date } => !!x.first)
    .sort((a, b) => a.first.getTime() - b.first.getTime());
  const todayReminders = reminders
    .flatMap((r) => reminderOccurrences(r, now, todayEnd, 3).map((at) => occ(r, at)))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 3);

  // ---- Goals ----
  const goalStats = goals.map((g) => ({ g, progress: goalProgress(g), expected: goalExpected(g, now) }));
  const avgProgress = goalStats.length ? Math.round(goalStats.reduce((s, x) => s + x.progress, 0) / goalStats.length) : 0;
  const topGoal = [...goalStats].sort((a, b) => b.progress - a.progress)[0];

  // ---- Habits ----
  let scheduled = 0;
  let completed = 0;
  let bestStreak = 0;
  let bestStreakHabit: string | null = null;
  for (const h of habits) {
    const done = habitDoneMap(h);
    if (isScheduled(h, todayKey)) {
      scheduled++;
      if (done(todayKey)) completed++;
    }
    const s = currentStreak(h, todayKey, tz);
    if (s > bestStreak) {
      bestStreak = s;
      bestStreakHabit = h.name;
    }
  }

  // ---- Calendar ----
  const occurrences = events.flatMap((ev) =>
    eventOccurrences(ev, todayStart, new Date(now.getTime() + 31 * 86400_000)).map((o) => ({ ev, ...o })),
  );
  const todayEvents = occurrences.filter((o) => o.start < todayEnd && o.end > todayStart);
  const nextEvent = occurrences.filter((o) => o.start >= now).sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  // ---- Upcoming timeline ----
  const items: UpcomingItem[] = [];
  for (const t of upcomingTasks) {
    const due = t.dueDate!;
    const hm = localHHmm(due, tz);
    const allDay = !t.startTime && (hm === "00:00" || hm === "23:59");
    items.push({
      key: `task-${t.id}`,
      id: t.id,
      type: "task",
      title: t.title,
      at: due.toISOString(),
      dayKey: dayKey(due, tz),
      time: allDay ? null : t.startTime ? hhmmLabel(t.startTime) : timeLabel(due, tz),
      endTime: t.endTime ? hhmmLabel(t.endTime) : null,
      color: t.category?.color ?? null,
      meta: `${PRIORITY_LABEL[t.priority]} priority`,
      priority: t.priority,
    });
  }
  for (const o of occurrences) {
    if (o.start >= windowEnd) continue;
    if (o.ev.allDay ? o.end <= todayStart : o.end <= now) continue;
    const kind = o.ev.kind;
    const type = kind === "birthday" || kind === "important" ? "date" : kind === "meeting" ? "meeting" : kind === "personal" ? "personal" : "event";
    const startKey = o.start < todayStart ? todayKey : dayKey(o.start, tz);
    items.push({
      key: `event-${o.ev.id}-${o.start.getTime()}`,
      id: o.ev.id,
      type,
      title: o.ev.title,
      at: (o.start < todayStart ? todayStart : o.start).toISOString(),
      dayKey: startKey,
      time: o.ev.allDay ? null : timeLabel(o.start, tz),
      endTime: o.ev.allDay ? null : timeLabel(o.end, tz),
      color: o.ev.color,
      meta: kind === "birthday" ? "Birthday" : kind === "important" ? "Important date" : o.ev.location,
    });
  }
  for (const r of reminders) {
    for (const at of reminderOccurrences(r, now, windowEnd, 2)) {
      items.push({
        key: `rem-${r.id}-${at.getTime()}`,
        id: r.id,
        type: "reminder",
        title: r.title,
        at: at.toISOString(),
        dayKey: dayKey(at, tz),
        time: timeLabel(at, tz),
        endTime: null,
        color: null,
        meta: r.recurrence === "NONE" ? null : "Repeats",
      });
    }
  }
  // All-day items first within a day, then chronological.
  items.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || (a.time === null ? -1 : 0) - (b.time === null ? -1 : 0) || a.at.localeCompare(b.at));
  const upcoming: UpcomingDay[] = [];
  for (const it of items) {
    let day = upcoming[upcoming.length - 1];
    if (!day || day.key !== it.dayKey) {
      day = { key: it.dayKey, label: relDayLabel(it.dayKey, todayKey), items: [] };
      upcoming.push(day);
    }
    day.items.push(it);
  }

  const completedToday = todayTasks.filter((t) => t.status === "COMPLETED").length;
  const firstName = user.name?.trim().split(/\s+/)[0] ?? "";

  const data: DashboardData = {
    today: { key: todayKey, label: longDayLabel(todayKey), greeting: greeting(now, tz), firstName, generatedAt: now.toISOString() },
    tasks: { total: todayTasks.length, completed: completedToday, remaining: todayTasks.length - completedToday, percent: pct(completedToday, todayTasks.length), overdue },
    goals: {
      active: goals.length,
      avgProgress,
      onTrack: goalStats.filter((x) => x.expected != null && x.progress >= x.expected).length,
      top: topGoal ? { id: topGoal.g.id, title: topGoal.g.title, progress: topGoal.progress, color: topGoal.g.color } : null,
    },
    reminders: { next24h: next24.length, next: next24[0] ? occ(next24[0].r, next24[0].first) : null },
    habits: { total: habits.length, scheduled, completed, bestStreak, bestStreakHabit },
    calendar: {
      today: todayEvents.length,
      next: nextEvent
        ? {
            id: nextEvent.ev.id,
            title: nextEvent.ev.title,
            time: nextEvent.ev.allDay ? null : timeLabel(nextEvent.start, tz),
            dayKey: dayKey(nextEvent.start, tz),
            dayLabel: relDayLabel(dayKey(nextEvent.start, tz), todayKey),
          }
        : null,
    },
    notes: { total: noteCount, latest: latestNote ? { id: latestNote.id, title: latestNote.title, updatedAt: latestNote.updatedAt.toISOString() } : null },
    focus: {
      tasks: focusTasks,
      suggested,
      statement: settings?.dailyFocusDate === todayKey ? (settings.dailyFocus ?? null) : null,
      reminders: todayReminders,
    },
    upcoming,
  };
  return data;
});
