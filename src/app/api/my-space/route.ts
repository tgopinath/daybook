import { db } from "@/lib/db";
import { route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey, dayRange, greeting } from "@/lib/time";
import { checkinStreaks } from "@/lib/mood";
import type { Mood } from "@/lib/moods";
import { formatMoney } from "@/lib/money";
import { budgetProgress } from "@/lib/finance";
import { readMySpaceLayout } from "@/components/my-space/registry";
import { SECTION_IDS, type MediaLite, type MySpaceData, type MySpaceSections, type SectionId } from "@/components/my-space/types";
import { focus, upcoming, week, type Ctx } from "./_lib/today";
import {
  currentStreak,
  eventOccurrences,
  goalInclude,
  goalProgress,
  habitDoneMap,
  hhmmLabel,
  isScheduled,
  localHHmm,
  longDayLabel,
  pct,
  relDayLabel,
  reminderOccurrences,
  timeLabel,
} from "@/app/api/dashboard/_lib/shared";

const OPEN = ["NOT_STARTED", "IN_PROGRESS"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "25 Nov" (this year) or "25 Nov 2024". */
function keyLabel(key: string, todayKey: string | null) {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]}${todayKey && y === Number(todayKey.slice(0, 4)) ? "" : ` ${y}`}`;
}
/** "Today", "Yesterday", "Thu 19 Nov", or "19 Nov 2024" for older years. */
function relLabel(key: string, todayKey: string) {
  if (key.slice(0, 4) !== todayKey.slice(0, 4)) return keyLabel(key, todayKey);
  return relDayLabel(key, todayKey);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const live = (userId: string) => ({ userId, deletedAt: null, archivedAt: null });

// ------------------------------------------------------------------ sections

async function tasks({ userId, tz, todayKey, todayStart, todayEnd }: Ctx): Promise<MySpaceSections["tasks"]> {
  const where = live(userId);
  const [rows, dueToday, overdue, completedToday] = await Promise.all([
    db.task.findMany({
      where: { ...where, status: { in: [...OPEN] }, dueDate: { lt: todayEnd } },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      take: 8,
      select: { id: true, title: true, priority: true, recurrence: true, dueDate: true, startTime: true },
    }),
    db.task.count({ where: { ...where, status: { in: [...OPEN] }, dueDate: { gte: todayStart, lt: todayEnd } } }),
    db.task.count({ where: { ...where, status: { in: [...OPEN] }, dueDate: { lt: todayStart } } }),
    db.task.count({ where: { userId, deletedAt: null, status: "COMPLETED", completedAt: { gte: todayStart, lt: todayEnd } } }),
  ]);
  // Today's first (by time), then overdue from the most recent.
  const items = rows.map((t) => {
    const due = t.dueDate!;
    const isOverdue = due < todayStart;
    const hm = localHHmm(due, tz);
    const time = t.startTime ? hhmmLabel(t.startTime) : hm === "00:00" || hm === "23:59" ? null : timeLabel(due, tz);
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      recurrence: t.recurrence,
      overdue: isOverdue,
      dueLabel: isOverdue ? `Overdue · ${relLabel(dayKey(due, tz), todayKey)}` : time ? `Today · ${time}` : "Today",
      at: due.getTime(),
    };
  });
  items.sort((a, b) => Number(a.overdue) - Number(b.overdue) || (a.overdue ? b.at - a.at : a.at - b.at));
  return { dueToday, overdue, completedToday, items: items.map(({ at: _at, ...rest }) => rest) };
}

async function goals({ userId, now, todayKey, tz }: Ctx): Promise<MySpaceSections["goals"]> {
  const rows = await db.goal.findMany({ where: { ...live(userId), status: "ACTIVE" }, include: goalInclude, orderBy: [{ targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
  const stats = rows.map((g) => ({ g, progress: goalProgress(g) }));
  const avg = stats.length ? Math.round(stats.reduce((s, x) => s + x.progress, 0) / stats.length) : 0;
  return {
    active: rows.length,
    avgProgress: avg,
    items: stats.slice(0, 6).map(({ g, progress }) => ({
      id: g.id,
      title: g.title,
      progress,
      color: g.color,
      targetLabel: g.targetDate ? (g.targetDate < now ? `Was due ${keyLabel(dayKey(g.targetDate, tz), todayKey)}` : `By ${keyLabel(dayKey(g.targetDate, tz), todayKey)}`) : null,
    })),
  };
}

async function calendar({ userId, tz, now, todayKey, todayStart, todayEnd }: Ctx): Promise<MySpaceSections["calendar"]> {
  const horizon = new Date(todayStart.getTime() + 21 * 86400_000);
  const events = await db.calendarEvent.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ start: { lt: horizon }, end: { gt: todayStart } }, { recurrence: { in: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] }, start: { lt: horizon } }],
    },
  });
  const occ = events.flatMap((ev) => eventOccurrences(ev, todayStart, horizon, 20).map((o) => ({ ev, ...o })));
  const today = occ.filter((o) => o.start < todayEnd && o.end > todayStart).length;
  const upcoming = occ
    .filter((o) => (o.ev.allDay ? o.end > todayStart : o.end > now))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 8)
    .map((o) => {
      const startKey = o.start < todayStart ? todayKey : dayKey(o.start, tz);
      return {
        key: `${o.ev.id}-${o.start.getTime()}`,
        id: o.ev.id,
        title: o.ev.title,
        dayLabel: relDayLabel(startKey, todayKey),
        time: o.ev.allDay ? null : timeLabel(o.start, tz),
        color: o.ev.color,
        isToday: startKey === todayKey,
        location: o.ev.location,
      };
    });
  return { today, items: upcoming };
}

async function reminders({ userId, tz, now, todayKey }: Ctx): Promise<MySpaceSections["reminders"]> {
  const rows = await db.reminder.findMany({ where: { ...live(userId), status: "ACTIVE" } });
  const until = new Date(now.getTime() + 60 * 86400_000);
  const items = rows
    .map((r) => ({ r, at: reminderOccurrences(r, now, until, 1)[0] }))
    .filter((x): x is { r: (typeof rows)[number]; at: Date } => !!x.at)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 6)
    .map(({ r, at }) => ({
      key: `${r.id}-${at.getTime()}`,
      id: r.id,
      title: r.title,
      kind: r.kind,
      dayLabel: relDayLabel(dayKey(at, tz), todayKey),
      time: timeLabel(at, tz),
      repeats: r.recurrence !== "NONE",
    }));
  return { active: rows.length, items };
}

async function habits({ userId, tz, todayKey }: Ctx): Promise<MySpaceSections["habits"]> {
  const rows = await db.habit.findMany({
    where: live(userId),
    orderBy: { createdAt: "asc" },
    include: { entries: { where: { date: { gte: addDaysKey(todayKey, -400) } }, select: { date: true, count: true } } },
  });
  const today = rows.filter((h) => isScheduled(h, todayKey));
  const items = today.map((h) => {
    const done = habitDoneMap(h)(todayKey);
    const count = h.entries.filter((e) => e.date === todayKey).reduce((s, e) => s + e.count, 0);
    return { id: h.id, name: h.name, color: h.color, done, count, target: Math.max(1, h.targetPerDay), streak: currentStreak(h, todayKey, tz) };
  });
  return { scheduled: items.length, done: items.filter((i) => i.done).length, items: items.slice(0, 10) };
}

async function notes({ userId, tz, todayKey }: Ctx): Promise<MySpaceSections["notes"]> {
  const where = live(userId);
  const [total, rows] = await Promise.all([
    db.note.count({ where }),
    db.note.findMany({ where, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 6, select: { id: true, title: true, plainText: true, pinned: true, updatedAt: true } }),
  ]);
  return {
    total,
    items: rows.map((n) => ({
      id: n.id,
      title: n.title || "Untitled",
      preview: n.plainText.replace(/\s+/g, " ").trim().slice(0, 120),
      pinned: n.pinned,
      updatedLabel: relLabel(dayKey(n.updatedAt, tz), todayKey),
    })),
  };
}

async function journal({ userId, todayKey }: Ctx): Promise<MySpaceSections["journal"]> {
  const where = { userId, deletedAt: null, isDraft: false };
  const [todayCount, total, days, latest] = await Promise.all([
    db.journalEntry.count({ where: { ...where, entryDate: todayKey } }),
    db.journalEntry.count({ where }),
    db.journalEntry.findMany({ where: { ...where, entryDate: { gte: addDaysKey(todayKey, -400), lte: todayKey } }, distinct: ["entryDate"], select: { entryDate: true } }),
    // Never select the entry text: titles only, and not even that for private entries.
    db.journalEntry.findFirst({
      where: { ...where, entryDate: { lte: todayKey } },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, title: true, isPrivate: true, entryDate: true, mood: true, wordCount: true },
    }),
  ]);
  return {
    todayCount,
    total,
    streak: checkinStreaks(days.map((d) => d.entryDate), todayKey).current,
    latest: latest
      ? {
          id: latest.id,
          title: latest.isPrivate ? null : latest.title.trim() || null,
          isPrivate: latest.isPrivate,
          dateLabel: relLabel(latest.entryDate, todayKey),
          mood: (latest.mood as Mood | null) ?? null,
          wordCount: latest.wordCount,
        }
      : null,
  };
}

async function gratitude({ userId, todayKey }: Ctx): Promise<MySpaceSections["gratitude"]> {
  const rows = await db.gratitudeEntry.findMany({ where: { userId, date: { gte: addDaysKey(todayKey, -400), lte: todayKey } }, select: { date: true, items: true } });
  const filled = rows.filter((g) => g.items.some((i) => i.trim()));
  const today = filled.find((g) => g.date === todayKey);
  return { streak: checkinStreaks(filled.map((g) => g.date), todayKey).current, today: today ? { items: today.items.filter((i) => i.trim()).slice(0, 3) } : null };
}

async function mood({ userId, todayKey }: Ctx): Promise<MySpaceSections["mood"]> {
  const weekFrom = addDaysKey(todayKey, -6);
  const [days, rows] = await Promise.all([
    db.moodEntry.findMany({ where: { userId, date: { gte: addDaysKey(todayKey, -400) } }, distinct: ["date"], select: { date: true } }),
    db.moodEntry.findMany({ where: { userId, date: { gte: weekFrom, lte: todayKey } }, orderBy: { loggedAt: "desc" }, select: { id: true, date: true, mood: true, loggedAt: true } }),
  ]);
  const todays = rows.filter((r) => r.date === todayKey);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDaysKey(weekFrom, i);
    const latest = rows.find((r) => r.date === day);
    return { day, label: relDayLabel(day, todayKey), mood: (latest?.mood as Mood | undefined) ?? null };
  });
  return {
    streak: checkinStreaks(days.map((d) => d.date), todayKey).current,
    today: todays[0] ? { id: todays[0].id, mood: todays[0].mood as Mood, loggedAt: todays[0].loggedAt.toISOString(), count: todays.length } : null,
    week,
  };
}

async function memories({ userId, tz, todayKey }: Ctx): Promise<MySpaceSections["memories"]> {
  const where = live(userId);
  const [total, rows, dates] = await Promise.all([
    db.memory.count({ where }),
    db.memory.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        date: true,
        media: { orderBy: { sortOrder: "asc" }, take: 1, select: { media: { select: { id: true, kind: true, originalName: true, status: true } } } },
      },
    }),
    db.memory.findMany({ where, select: { id: true, title: true, date: true } }),
  ]);
  const md = todayKey.slice(5);
  const year = Number(todayKey.slice(0, 4));
  const otd = dates
    .map((m) => ({ m, key: dayKey(m.date, tz) }))
    .filter((x) => x.key.slice(5) === md && Number(x.key.slice(0, 4)) < year)
    .sort((a, b) => b.key.localeCompare(a.key));
  const first = otd[0];
  return {
    total,
    items: rows.map((m) => {
      const f = m.media[0]?.media;
      const cover: MediaLite | null = f && f.status === "ready" ? { id: f.id, kind: f.kind as MediaLite["kind"], url: `/api/media/${f.id}`, originalName: f.originalName } : null;
      return { id: m.id, title: m.title, dateLabel: keyLabel(dayKey(m.date, tz), todayKey), cover };
    }),
    onThisDay: { count: otd.length, first: first ? { id: first.m.id, title: first.m.title, yearsAgo: year - Number(first.key.slice(0, 4)) } : null },
  };
}

async function bucket({ userId, tz, todayKey }: Ctx): Promise<MySpaceSections["bucket"]> {
  const where = live(userId);
  const [total, done, next] = await Promise.all([
    db.bucketItem.count({ where }),
    db.bucketItem.count({ where: { ...where, completedAt: { not: null } } }),
    db.bucketItem.findFirst({
      where: { ...where, completedAt: null },
      orderBy: [{ targetDate: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, category: true, targetDate: true },
    }),
  ]);
  return {
    total,
    done,
    percent: pct(done, total),
    next: next ? { id: next.id, title: next.title, category: next.category, targetLabel: next.targetDate ? keyLabel(dayKey(next.targetDate, tz), todayKey) : null } : null,
  };
}

async function timeline({ userId, tz, todayKey }: Ctx): Promise<MySpaceSections["timeline"]> {
  const where = { userId, deletedAt: null };
  const [total, latest] = await Promise.all([
    db.timelineEvent.count({ where }),
    db.timelineEvent.findFirst({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { id: true, title: true, date: true, datePrecision: true, category: true } }),
  ]);
  let dateLabel = "";
  if (latest) {
    const key = dayKey(latest.date, tz);
    const [y, m] = key.split("-").map(Number);
    dateLabel = latest.datePrecision === "year" ? String(y) : latest.datePrecision === "month" ? `${MONTHS_LONG[m! - 1]} ${y}` : keyLabel(key, null);
  }
  return { total, latest: latest ? { id: latest.id, title: latest.title, dateLabel, category: latest.category } : null };
}

async function vault({ userId }: Ctx): Promise<MySpaceSections["vault"]> {
  // Counts only: encrypted fields are never read here.
  const groups = await db.vaultItem.groupBy({ by: ["category"], where: { userId, deletedAt: null }, _count: { _all: true } });
  const categories = groups.map((g) => ({ category: g.category, count: g._count._all })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { total: categories.reduce((s, c) => s + c.count, 0), categories };
}

async function storage({ userId, tz, todayKey }: Ctx): Promise<MySpaceSections["storage"]> {
  const [agg, files, recent] = await Promise.all([
    db.mediaFile.aggregate({ where: { userId, status: "ready" }, _sum: { size: true } }),
    db.driveFile.count({ where: { userId, deletedAt: null } }),
    db.driveFile.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, name: true, updatedAt: true, media: { select: { kind: true, size: true } } },
    }),
  ]);
  const bytes = agg._sum.size ?? 0;
  return {
    bytesUsed: bytes,
    label: formatBytes(bytes),
    files,
    recent: recent.map((f) => ({ id: f.id, name: f.name, kind: f.media.kind, sizeLabel: formatBytes(f.media.size), updatedLabel: relLabel(dayKey(f.updatedAt, tz), todayKey) })),
  };
}

async function security({ userId, now }: Ctx): Promise<MySpaceSections["security"]> {
  const [user, settings, backupLeft, sessions] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } }),
    db.userSettings.findUnique({ where: { userId }, select: { appLockPinHash: true, appLockMinutes: true } }),
    db.backupCode.count({ where: { userId, usedAt: null } }),
    db.session.count({ where: { userId, expiresAt: { gt: now } } }),
  ]);
  const lock = !!settings?.appLockPinHash;
  return { twoFactor: !!user?.totpEnabledAt, appLock: lock, appLockMinutes: lock ? settings!.appLockMinutes : 0, backupCodesLeft: backupLeft, sessions };
}

async function finance({ userId, todayKey }: Ctx): Promise<MySpaceSections["finance"]> {
  const month = todayKey.slice(0, 7);
  const [settings, groups, budgets] = await Promise.all([
    db.userSettings.findUnique({ where: { userId }, select: { currency: true } }),
    db.transaction.groupBy({
      by: ["type", "category"],
      where: { userId, deletedAt: null, date: { gte: `${month}-01`, lte: `${month}-31` } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.budget.findMany({ where: { userId }, select: { id: true, category: true, month: true, limit: true } }),
  ]);
  const currency = settings?.currency || "INR";
  const money = (n: number) => formatMoney(n, currency, { hideZeroDecimals: true });
  let income = 0;
  let expense = 0;
  let count = 0;
  const byCategory = new Map<string, number>();
  for (const g of groups) {
    const amt = g._sum.amount ?? 0;
    count += g._count._all;
    if (g.type === "income") income += amt;
    else if (g.type === "expense") {
      expense += amt;
      byCategory.set(g.category, (byCategory.get(g.category) ?? 0) + amt);
    }
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const rank = { over: 2, warn: 1, ok: 0 } as const;
  const worst = budgetProgress(budgets, month, byCategory).sort((a, b) => rank[b.state] - rank[a.state] || b.percent - a.percent)[0];
  const [y, m] = month.split("-").map(Number);
  return {
    currency,
    monthLabel: `${MONTHS_LONG[m! - 1]} ${y}`,
    income,
    expense,
    net: income - expense,
    incomeLabel: money(income),
    expenseLabel: money(expense),
    netLabel: formatMoney(income - expense, currency, { hideZeroDecimals: true, sign: "always" }),
    count,
    topCategory: top ? { name: top[0], label: money(top[1]) } : null,
    budget: worst
      ? { category: worst.category === "*" ? "Monthly budget" : worst.category, percent: worst.percent, state: worst.state, spentLabel: money(worst.spent), limitLabel: money(worst.limit) }
      : null,
  };
}

const SECTIONS: { [K in SectionId]: (ctx: Ctx) => Promise<MySpaceSections[K]> } = {
  focus,
  upcoming,
  week,
  tasks,
  goals,
  calendar,
  reminders,
  habits,
  notes,
  journal,
  gratitude,
  mood,
  memories,
  bucket,
  timeline,
  vault,
  storage,
  security,
  finance,
};

/** Gentle one-liner under the greeting, from sections already loaded (nothing is computed twice). */
function subtitleOf(s: Partial<MySpaceSections>): string | null {
  const journalStreak = s.journal?.streak ?? 0;
  const gratitudeStreak = s.gratitude?.streak ?? 0;
  const moodStreak = s.mood?.streak ?? 0;
  const doneToday = s.tasks?.completedToday ?? 0;
  const best = (s.habits?.items ?? []).reduce<{ name: string; streak: number } | null>((b, h) => (h.streak > (b?.streak ?? 0) ? { name: h.name, streak: h.streak } : b), null);
  if (journalStreak >= 2) return `You've journaled ${journalStreak} days in a row.`;
  if (gratitudeStreak >= 2) return `${gratitudeStreak} days of gratitude in a row — lovely.`;
  if (moodStreak >= 3) return `You've checked in with yourself ${moodStreak} days running.`;
  if (doneToday > 0) return `${doneToday} ${doneToday === 1 ? "task" : "tasks"} done already today. Nice pace.`;
  if (best && best.streak >= 3) return `${best.name} is on a ${best.streak}-day streak.`;
  return "A fresh page — what would make today good?";
}

/**
 * Everything My space shows (the home page), in one request: the greeting, Today (focus, mood, upcoming),
 * the module widgets and This week. Sections run in parallel and fail on their own (null), so one broken
 * module never blanks the page. `?only=focus,habits` recomputes just those (used by card retries).
 */
export const GET = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const now = new Date();
  const todayKey = dayKey(now, tz);
  const [todayStart, todayEnd] = dayRange(now, tz);
  const ctx: Ctx = { userId: user.id, tz, now, todayKey, todayStart, todayEnd };

  const only = req.nextUrl.searchParams.get("only");
  const wanted = only ? SECTION_IDS.filter((id) => only.split(",").includes(id)) : SECTION_IDS;

  const [settings, ...results] = await Promise.all([
    db.userSettings.findUnique({ where: { userId: user.id }, select: { dashboardWidgets: true } }).catch(() => null),
    ...wanted.map((id) =>
      (SECTIONS[id] as (c: Ctx) => Promise<unknown>)(ctx).catch((err) => {
        console.error(`my-space: ${id} failed`, err);
        return null;
      }),
    ),
  ]);

  const sections: Record<string, unknown> = {};
  wanted.forEach((id, i) => (sections[id] = results[i] ?? null));
  const typed = sections as MySpaceData["sections"];

  const data: MySpaceData = {
    today: {
      key: todayKey,
      label: longDayLabel(todayKey),
      greeting: greeting(now, tz),
      firstName: user.name?.trim().split(/\s+/)[0] ?? "",
      subtitle: only ? null : subtitleOf(typed),
    },
    layout: readMySpaceLayout(settings?.dashboardWidgets),
    sections: typed,
  };
  return data;
});
