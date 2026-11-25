import "server-only";
import type { WeeklyReview } from "@prisma/client";
import { db } from "@/lib/db";
import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";
import { averageIntensity, averageScore, distribution, groupByDay, latestPerDay } from "@/lib/mood";
import type { Mood } from "@/lib/moods";
import { habitDoneMap, habitStartKey, isScheduled, pct } from "@/app/api/dashboard/_lib/shared";
import type { Achievement, AttentionItem, Reflection, WeekInfo, WeekStats } from "@/components/weekly-review/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OPEN = ["NOT_STARTED", "IN_PROGRESS"] as const;

/** First day of the week containing `key` for weekStart 0 (Sun) or 1 (Mon). */
export function weekStartOf(key: string, weekStart: number): string {
  const offset = (weekdayOfKey(key) - (weekStart === 0 ? 0 : 1) + 7) % 7;
  return addDaysKey(key, -offset);
}

export function weekLabel(start: string): string {
  const end = addDaysKey(start, 6);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy !== ey) return `${sd} ${MONTHS[sm! - 1]} ${sy} – ${ed} ${MONTHS[em! - 1]} ${ey}`;
  if (sm !== em) return `${sd} ${MONTHS[sm! - 1]} – ${ed} ${MONTHS[em! - 1]} ${ey}`;
  return `${sd} – ${ed} ${MONTHS[em! - 1]} ${ey}`;
}

export function weekInfo(start: string, todayKey: string, weekStart: number): WeekInfo {
  const current = weekStartOf(todayKey, weekStart);
  const end = addDaysKey(start, 6);
  const next = addDaysKey(start, 7);
  const elapsed = start > todayKey ? 0 : end <= todayKey ? 7 : Math.round((Date.parse(todayKey) - Date.parse(start)) / 86400000) + 1;
  return {
    start,
    end,
    label: weekLabel(start),
    isCurrent: start === current,
    isFuture: start > current,
    prev: addDaysKey(start, -7),
    next: next > current ? null : next,
    daysElapsed: elapsed,
  };
}

export async function userWeekStart(userId: string): Promise<number> {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { weekStart: true } });
  return s?.weekStart === 0 ? 0 : 1;
}

export function serializeReflection(r: WeeklyReview | null): Reflection | null {
  if (!r) return null;
  return {
    weekStart: r.weekStart,
    rating: r.rating,
    wins: r.wins ?? "",
    challenges: r.challenges ?? "",
    lessons: r.lessons ?? "",
    nextWeekFocus: r.nextWeekFocus ?? "",
    updatedAt: r.updatedAt.toISOString(),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Everything the weekly review shows "from your data" for the week starting `start`. */
export async function computeWeek(userId: string, tz: string, start: string, todayKey: string): Promise<WeekStats> {
  const end = addDaysKey(start, 6);
  const endEx = addDaysKey(start, 7);
  const from = zonedToUtc(start, "00:00", tz);
  const to = zonedToUtc(endEx, "00:00", tz);
  const now = new Date();
  const todayStart = zonedToUtc(todayKey, "00:00", tz);
  const isCurrent = todayKey >= start && todayKey <= end;
  const lastKey = end < todayKey ? end : todayKey; // last day that has started
  const elapsed = start > todayKey ? 0 : Math.round((Date.parse(lastKey) - Date.parse(start)) / 86400000) + 1;
  const inWeek = { gte: from, lt: to };

  const [
    completedTasks,
    createdTasks,
    overdue,
    progressLogs,
    milestones,
    goalsCompleted,
    activeGoals,
    habits,
    moods,
    journal,
    gratitude,
    memories,
    bucket,
    timeline,
  ] = await Promise.all([
    db.task.findMany({
      where: { userId, deletedAt: null, status: "COMPLETED", completedAt: inWeek },
      orderBy: [{ priority: "asc" }, { completedAt: "desc" }],
      select: { id: true, title: true, priority: true, completedAt: true },
    }),
    db.task.count({ where: { userId, deletedAt: null, createdAt: inWeek } }),
    db.task.count({
      where: {
        userId,
        deletedAt: null,
        archivedAt: null,
        status: { in: [...OPEN] },
        dueDate: isCurrent ? { lt: todayStart } : { gte: from, lt: to < now ? to : todayStart },
      },
    }),
    db.goalProgress.findMany({
      where: { createdAt: { lt: to }, goal: { userId, deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { goalId: true, value: true, createdAt: true, goal: { select: { title: true, color: true, unit: true } } },
    }),
    db.milestone.findMany({
      where: { done: true, completedAt: inWeek, goal: { userId, deletedAt: null } },
      select: { id: true, title: true, goalId: true, goal: { select: { title: true } } },
      orderBy: { completedAt: "asc" },
    }),
    db.goal.findMany({ where: { userId, deletedAt: null, status: "COMPLETED", updatedAt: inWeek }, select: { id: true, title: true } }),
    db.goal.count({ where: { userId, deletedAt: null, archivedAt: null, status: "ACTIVE" } }),
    db.habit.findMany({
      where: { userId, deletedAt: null, archivedAt: null, createdAt: { lt: to } },
      include: { entries: { where: { date: { gte: addDaysKey(start, -400), lte: end } }, select: { date: true, count: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.moodEntry.findMany({
      where: { userId, date: { gte: start, lte: end } },
      select: { date: true, mood: true, intensity: true, factors: true, loggedAt: true },
    }),
    db.journalEntry.findMany({
      where: { userId, deletedAt: null, isDraft: false, entryDate: { gte: start, lte: end } },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      // Never select the text: private entries must not leak into summaries.
      select: { id: true, title: true, entryDate: true, isPrivate: true, wordCount: true },
    }),
    db.gratitudeEntry.findMany({ where: { userId, date: { gte: start, lte: end } }, select: { date: true, items: true } }),
    db.memory.findMany({ where: { userId, deletedAt: null, createdAt: inWeek }, select: { id: true, title: true }, orderBy: { createdAt: "asc" } }),
    db.bucketItem.findMany({ where: { userId, deletedAt: null, completedAt: inWeek }, select: { id: true, title: true }, orderBy: { completedAt: "asc" } }),
    db.timelineEvent.findMany({ where: { userId, deletedAt: null, createdAt: inWeek }, select: { id: true, title: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // ---- Goals: value change across the week ----
  const byGoal = new Map<string, { before: number | null; inWeek: number[]; meta: (typeof progressLogs)[number]["goal"] }>();
  for (const l of progressLogs) {
    const g = byGoal.get(l.goalId) ?? { before: null, inWeek: [], meta: l.goal };
    if (l.createdAt < from) g.before = l.value;
    else g.inWeek.push(l.value);
    byGoal.set(l.goalId, g);
  }
  const moved: WeekStats["goals"]["moved"] = [];
  let updates = 0;
  for (const [id, g] of byGoal) {
    if (!g.inWeek.length) continue;
    updates += g.inWeek.length;
    const fromV = g.before ?? 0;
    const toV = g.inWeek[g.inWeek.length - 1]!;
    if (toV !== fromV) moved.push({ id, title: g.meta.title, color: g.meta.color, from: fromV, to: toV, unit: g.meta.unit });
  }

  // ---- Habits ----
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  let hDone = 0;
  let hSched = 0;
  const perHabit = habits.map((h) => {
    const done = habitDoneMap(h);
    const first = habitStartKey(h, todayKey, tz);
    let d = 0;
    let s = 0;
    const cells = days.map((k) => {
      if (k > todayKey || k < first || !isScheduled(h, k)) return null;
      const ok = done(k);
      if (k === todayKey && !ok) return null; // today isn't missed yet
      s++;
      if (ok) d++;
      return ok;
    });
    hDone += d;
    hSched += s;
    return { id: h.id, name: h.name, color: h.color, done: d, scheduled: s, rate: s ? pct(d, s) : null, days: cells };
  });

  // ---- Mood ----
  const grouped = groupByDay(moods);
  const latest = latestPerDay(moods);
  const moodDays = days.map((k) => {
    const list = grouped.get(k);
    return { key: k, label: WD[weekdayOfKey(k)]!, mood: (latest.get(k)?.mood as Mood | undefined) ?? null, score: list ? averageScore(list) : null };
  });

  // ---- Journal ----
  const journalDays = new Set(journal.map((j) => j.entryDate)).size;
  const words = journal.reduce((s, j) => s + j.wordCount, 0);

  const gratitudeDays = gratitude.filter((g) => g.items.some((i) => i.trim())).length;

  // ---- Achievements ----
  const achievements: Achievement[] = [
    ...goalsCompleted.map((g) => ({ id: `goal-${g.id}`, type: "goal" as const, title: g.title, detail: "Goal completed", href: "/goals" })),
    ...milestones.map((m) => ({ id: `ms-${m.id}`, type: "milestone" as const, title: m.title, detail: m.goal.title, href: "/goals" })),
    ...bucket.map((b) => ({ id: `bucket-${b.id}`, type: "bucket" as const, title: b.title, detail: "Bucket list", href: "/bucket-list" })),
  ];

  // ---- Areas needing attention (deterministic rules) ----
  const attention: AttentionItem[] = [];
  if (overdue > 0) {
    attention.push({
      id: "overdue",
      text: isCurrent ? `${plural(overdue, "overdue task")} waiting for you` : `${plural(overdue, "task")} due this week ${overdue === 1 ? "is" : "are"} still open`,
      href: "/tasks",
    });
  }
  for (const h of perHabit.filter((h) => h.rate != null && h.rate < 50 && h.scheduled >= 3).slice(0, 3)) {
    attention.push({ id: `habit-${h.id}`, text: `${h.name}: done on ${h.done} of ${h.scheduled} days`, href: "/habits" });
  }
  const lowDays = moodDays.filter((d) => d.score != null && d.score <= 2).length;
  if (lowDays >= 2) attention.push({ id: "low-mood", text: `${lowDays} days felt heavy — be gentle with yourself`, href: "/mood" });
  if (elapsed >= 3) {
    if (!journal.length) attention.push({ id: "no-journal", text: isCurrent ? "No journal entries yet this week" : "No journal entries this week", href: "/journal" });
    if (!moods.length) attention.push({ id: "no-mood", text: isCurrent ? "No mood check-ins yet this week" : "No mood check-ins this week", href: "/mood" });
    if (!gratitudeDays) attention.push({ id: "no-gratitude", text: "No gratitude notes this week", href: "/gratitude" });
  }
  if (elapsed >= 5 && activeGoals > 0 && !updates && !milestones.length) {
    attention.push({ id: "no-goals", text: "No progress logged on your goals", href: "/goals" });
  }

  return {
    tasks: {
      completed: completedTasks.length,
      created: createdTasks,
      top: completedTasks.slice(0, 8).map((t) => ({ id: t.id, title: t.title, priority: t.priority, completedAt: t.completedAt!.toISOString() })),
      overdue,
    },
    goals: {
      updates,
      moved,
      milestones: milestones.map((m) => ({ id: m.id, title: m.title, goalId: m.goalId, goalTitle: m.goal.title })),
      completed: goalsCompleted,
    },
    habits: { rate: hSched ? pct(hDone, hSched) : null, done: hDone, scheduled: hSched, perHabit },
    mood: {
      avgScore: averageScore(moods),
      avgIntensity: averageIntensity(moods),
      checkins: moods.length,
      days: moodDays,
      distribution: distribution(moods).filter((d) => d.count > 0),
    },
    journal: {
      entries: journal.length,
      words,
      days: journalDays,
      items: journal.map((j) => ({ id: j.id, title: j.title.trim(), date: j.entryDate, isPrivate: j.isPrivate })),
    },
    gratitude: { days: gratitudeDays },
    memories: { count: memories.length, items: memories.slice(0, 6) },
    bucket: { completed: bucket },
    timeline: { added: timeline.length, items: timeline.slice(0, 6) },
    achievements,
    attention,
  };
}

/** Day key helper re-exported for routes. */
export { dayKey };
