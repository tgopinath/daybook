// The "Today" and "This week" parts of GET /api/my-space: Today's Focus, the seven-day Upcoming
// timeline and the weekly summary. (These used to live in GET /api/dashboard for the Overview.)
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDaysKey, dayKey, zonedToUtc } from "@/lib/time";
import { averageScore, dominantMood } from "@/lib/mood";
import { weekLabel, weekStartOf } from "@/app/api/weekly-review/_lib/compute";
import type { FocusTask, ReminderOccurrence, UpcomingDay, UpcomingItem } from "@/components/dashboard/types";
import type { FocusSection, UpcomingSection, WeekSection } from "@/components/my-space/types";
import {
  eventOccurrences,
  habitDoneMap,
  hhmmLabel,
  isScheduled,
  localHHmm,
  pct,
  PRIORITY_LABEL,
  relDayLabel,
  reminderOccurrences,
  timeLabel,
} from "@/app/api/dashboard/_lib/shared";

export type Ctx = { userId: string; tz: string; now: Date; todayKey: string; todayStart: Date; todayEnd: Date };

const OPEN = ["NOT_STARTED", "IN_PROGRESS"] as const;
const UPCOMING_DAYS = 7;
const live = (userId: string) => ({ userId, deletedAt: null, archivedAt: null });

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

/** Today's Focus: the pinned top three (or suggestions), today's intention, progress and today's reminders. */
export async function focus({ userId, tz, now, todayKey, todayStart, todayEnd }: Ctx): Promise<FocusSection> {
  const where = live(userId);
  const [settings, todayTasks, rows, reminders] = await Promise.all([
    db.userSettings.findUnique({ where: { userId }, select: { dailyFocus: true, dailyFocusDate: true } }),
    db.task.findMany({ where: { ...where, dueDate: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } }, select: { status: true } }),
    db.task.findMany({
      where: { ...where, focusRank: { not: null }, OR: [{ status: { in: [...OPEN] } }, { status: "COMPLETED", completedAt: { gte: todayStart } }] },
      orderBy: [{ focusRank: "asc" }, { updatedAt: "desc" }],
      take: 3,
      select: focusSelect,
    }),
    db.reminder.findMany({ where: { ...where, status: "ACTIVE" } }),
  ]);

  const toFocus = (t: FocusRow): FocusTask => {
    const due = t.dueDate;
    const dueKey = due ? dayKey(due, tz) : null;
    const overdue = !!due && due < todayStart && t.status !== "COMPLETED";
    let dueLabel: string | null = null;
    if (due && dueKey) {
      const hm = localHHmm(due, tz);
      const time = t.startTime ? hhmmLabel(t.startTime) : hm === "00:00" || hm === "23:59" ? null : timeLabel(due, tz);
      dueLabel = overdue ? `Overdue · ${relDayLabel(dueKey, todayKey)}` : [relDayLabel(dueKey, todayKey), time].filter(Boolean).join(" · ");
    }
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueDate: due?.toISOString() ?? null,
      dueLabel,
      overdue,
      focusRank: t.focusRank,
      category: t.category,
      goalTitle: t.goal?.title ?? null,
    };
  };
  const tasks = rows.map(toFocus);
  let suggested: FocusTask[] = [];
  if (tasks.length < 3) {
    const more = await db.task.findMany({
      where: { ...where, focusRank: null, status: { in: [...OPEN] }, dueDate: { lt: todayEnd } },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 3 - tasks.length,
      select: focusSelect,
    });
    suggested = more.map(toFocus);
  }

  const todayReminders: ReminderOccurrence[] = reminders
    .flatMap((r) =>
      reminderOccurrences(r, now, todayEnd, 3).map((at) => {
        const k = dayKey(at, tz);
        return { id: r.id, title: r.title, kind: r.kind, at: at.toISOString(), time: timeLabel(at, tz), dayKey: k, dayLabel: relDayLabel(k, todayKey) };
      }),
    )
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 3);

  const completed = todayTasks.filter((t) => t.status === "COMPLETED").length;
  return {
    tasks,
    suggested,
    statement: settings?.dailyFocusDate === todayKey ? (settings.dailyFocus ?? null) : null,
    reminders: todayReminders,
    progress: { total: todayTasks.length, completed, percent: pct(completed, todayTasks.length) },
  };
}

/** The next seven days: tasks with a due date, events (with repeats) and reminders, grouped by day. */
export async function upcoming({ userId, tz, now, todayKey, todayStart }: Ctx): Promise<UpcomingSection> {
  const windowEnd = zonedToUtc(addDaysKey(todayKey, UPCOMING_DAYS), "00:00", tz);
  const where = live(userId);
  const [tasks, events, reminders] = await Promise.all([
    db.task.findMany({
      where: { ...where, status: { in: [...OPEN] }, dueDate: { gte: todayStart, lt: windowEnd } },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, dueDate: true, startTime: true, endTime: true, priority: true, category: { select: { color: true } } },
    }),
    db.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [{ start: { lt: windowEnd }, end: { gt: todayStart } }, { recurrence: { in: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] }, start: { lt: windowEnd } }],
      },
    }),
    db.reminder.findMany({ where: { ...where, status: "ACTIVE" } }),
  ]);

  const items: UpcomingItem[] = [];
  for (const t of tasks) {
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
  for (const ev of events) {
    for (const o of eventOccurrences(ev, todayStart, windowEnd)) {
      if (o.start >= windowEnd) continue;
      if (ev.allDay ? o.end <= todayStart : o.end <= now) continue;
      const kind = ev.kind;
      const type = kind === "birthday" || kind === "important" ? "date" : kind === "meeting" ? "meeting" : kind === "personal" ? "personal" : "event";
      const startKey = o.start < todayStart ? todayKey : dayKey(o.start, tz);
      items.push({
        key: `event-${ev.id}-${o.start.getTime()}`,
        id: ev.id,
        type,
        title: ev.title,
        at: (o.start < todayStart ? todayStart : o.start).toISOString(),
        dayKey: startKey,
        time: ev.allDay ? null : timeLabel(o.start, tz),
        endTime: ev.allDay ? null : timeLabel(o.end, tz),
        color: ev.color,
        meta: kind === "birthday" ? "Birthday" : kind === "important" ? "Important date" : ev.location,
      });
    }
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
  const days: UpcomingDay[] = [];
  for (const it of items) {
    let day = days[days.length - 1];
    if (!day || day.key !== it.dayKey) {
      day = { key: it.dayKey, label: relDayLabel(it.dayKey, todayKey), items: [] };
      days.push(day);
    }
    day.items.push(it);
  }
  return { days };
}

/** This week so far: tasks done, habit consistency, mood and journal days. */
export async function week({ userId, tz, todayKey, todayEnd }: Ctx): Promise<WeekSection> {
  const settings = await db.userSettings.findUnique({ where: { userId }, select: { weekStart: true } });
  const start = weekStartOf(todayKey, settings?.weekStart === 0 ? 0 : 1);
  const weekFrom = zonedToUtc(start, "00:00", tz);
  const [tasksDone, moods, journalDays, habits] = await Promise.all([
    db.task.count({ where: { userId, deletedAt: null, status: "COMPLETED", completedAt: { gte: weekFrom, lt: todayEnd } } }),
    db.moodEntry.findMany({ where: { userId, date: { gte: start, lte: todayKey } }, select: { mood: true, intensity: true, factors: true, date: true, loggedAt: true } }),
    db.journalEntry.findMany({ where: { userId, deletedAt: null, isDraft: false, entryDate: { gte: start, lte: todayKey } }, distinct: ["entryDate"], select: { entryDate: true } }),
    db.habit.findMany({ where: live(userId), include: { entries: { where: { date: { gte: start, lte: todayKey } }, select: { date: true, count: true } } } }),
  ]);

  // Habit consistency this week (today counts once done).
  let done = 0;
  let scheduled = 0;
  for (const h of habits) {
    const isDone = habitDoneMap(h);
    const first = dayKey(h.createdAt, tz);
    for (let k = start; k <= todayKey; k = addDaysKey(k, 1)) {
      if (k < first || !isScheduled(h, k)) continue;
      const ok = isDone(k);
      if (k === todayKey && !ok) continue;
      scheduled++;
      if (ok) done++;
    }
  }
  return {
    start,
    label: weekLabel(start),
    tasksDone,
    habitRate: scheduled ? pct(done, scheduled) : null,
    moodAvg: averageScore(moods),
    moodDominant: dominantMood(moods),
    journalDays: journalDays.length,
    elapsed: Math.round((Date.parse(todayKey) - Date.parse(start)) / 86400000) + 1,
  };
}
