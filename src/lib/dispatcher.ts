import "server-only";
import type { Reminder } from "@prisma/client";
import { db } from "./db";
import { notify } from "./notify";
import * as webpush from "web-push";
import { nextOccurrence, nextOccurrenceTz, type RecurrenceSpec } from "./recurrence";

export { nextOccurrenceTz };
import { dayKey, dayRange, tzOffsetMinutes, zonedToUtc, isValidTz } from "./time";

/**
 * Notification scheduler. Runs every 30 s from instrumentation.ts and on demand
 * from /api/cron/dispatch. Every write is a conditional update ("claim") so two
 * overlapping runs — even in different processes — never double-fire.
 */

// ------------------------------------------------------------------ push
// Local Web Push sender. `@/lib/push` default-imports web-push, which resolves
// to undefined under serverExternalPackages (TypeError on setVapidDetails), so
// the scheduler and the test endpoint use a namespace import here.

let vapidReady: boolean | null = null;
export function pushReady() {
  if (vapidReady === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    vapidReady = false;
    if (pub && priv) {
      try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@localhost", pub, priv);
        vapidReady = true;
      } catch (err) {
        console.error("[push] invalid VAPID configuration", err);
      }
    }
  }
  return vapidReady;
}

export type PushPayload = { title: string; body?: string; link?: string; tag?: string; notificationId?: string; actions?: { action: string; title: string }[] };

/** Sends to every subscribed device of the user; prunes expired subscriptions. Returns devices reached. */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!pushReady()) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.warn("[push] delivery failed", code ?? err);
      }
    }),
  );
  return sent;
}

const REMINDER_ACTIONS = [
  { action: "snooze", title: "Snooze 10 min" },
  { action: "done", title: "Mark done" },
];

export const KIND_LABEL: Record<string, string> = {
  water: "Drink water",
  break: "Break",
  meeting: "Meeting",
  bill: "Bill",
  family: "Family",
  deadline: "Deadline",
  routine: "Routine",
  custom: "Reminder",
};

function safeTz(tz: string | null | undefined) {
  return tz && isValidTz(tz) ? tz : "UTC";
}

function specOf(r: Pick<Reminder, "recurrence" | "intervalMinutes" | "daysOfWeek" | "endsAt">): RecurrenceSpec {
  return { recurrence: r.recurrence, intervalMinutes: r.intervalMinutes, daysOfWeek: r.daysOfWeek, endsAt: r.endsAt };
}

/** Local weekday (0 = Sunday) of an instant in tz. */
export function weekdayIn(d: Date, tz: string) {
  const key = dayKey(d, tz);
  const [y, m, day] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).getUTCDay();
}

/** Moves a weekday-based reminder's first fire time onto an allowed weekday. */
export function alignToDays(remindAt: Date, spec: RecurrenceSpec, tz: string): Date {
  const days = spec.daysOfWeek ?? [];
  const weekdayBased = (spec.recurrence === "WEEKLY" || spec.recurrence === "CUSTOM") && days.length > 0;
  if (!weekdayBased || days.includes(weekdayIn(remindAt, tz))) return remindAt;
  return nextOccurrenceTz(remindAt, { ...spec, endsAt: null }, remindAt, tz) ?? remindAt;
}

/**
 * Completes a reminder. One-time → COMPLETED. Recurring: if a snoozed
 * occurrence is pending it is acknowledged; otherwise the upcoming occurrence
 * is skipped and remindAt advances to the next one (COMPLETED when the series
 * has ended).
 */
export async function completeReminder(r: Reminder, tz: string, opts: { acknowledgeOnly?: boolean } = {}) {
  const now = new Date();
  let data: { status?: "COMPLETED"; remindAt?: Date; snoozedUntil: null; lastFiredAt?: Date | null };
  if (r.recurrence === "NONE") {
    data = { status: "COMPLETED", snoozedUntil: null };
  } else if (r.snoozedUntil || opts.acknowledgeOnly) {
    data = { snoozedUntil: null };
  } else {
    const after = r.remindAt > now ? r.remindAt : now;
    const next = nextOccurrenceTz(r.remindAt, specOf(r), after, tz);
    data = next ? { remindAt: next, snoozedUntil: null } : { status: "COMPLETED", snoozedUntil: null };
  }
  const updated = await db.reminder.update({ where: { id: r.id }, data });
  await db.notification.updateMany({
    where: { userId: r.userId, type: "REMINDER", sourceId: r.id, readAt: null },
    data: { readAt: now },
  });
  return updated;
}

export async function snoozeReminder(r: Reminder, until: Date) {
  const updated = await db.reminder.update({ where: { id: r.id }, data: { snoozedUntil: until, status: "ACTIVE" } });
  await db.notification.updateMany({
    where: { userId: r.userId, type: "REMINDER", sourceId: r.id, readAt: null },
    data: { readAt: new Date() },
  });
  return updated;
}

type Settings = { timezone: string; reminderLeadMinutes: number; browserNotifications: boolean } | null;

async function settingsFor(userIds: string[]) {
  const rows = await db.userSettings.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, timezone: true, reminderLeadMinutes: true, browserNotifications: true, notifyOverdue: true, notifyCalendar: true },
  });
  return new Map(rows.map((r) => [r.userId, r]));
}

/** Creates the in-app row via notify() and pushes with action buttons. */
async function notifyWithActions(
  userId: string,
  settings: Settings,
  n: Parameters<typeof notify>[1],
  actions?: { action: string; title: string }[],
) {
  const row = await notify(userId, { ...n, push: false });
  if (!row) return null;
  if (settings?.browserNotifications ?? true) {
    try {
      const sent = await sendPush(userId, { title: n.title, body: n.body, link: n.link, tag: n.sourceId ?? row.id, notificationId: row.id, actions });
      if (sent) await db.notification.update({ where: { id: row.id }, data: { delivered: true } });
    } catch (err) {
      console.error("[dispatcher] push failed", err);
    }
  }
  return row;
}

function fmtTime(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

// ---------------------------------------------------------------- reminders

async function dispatchReminders(now: Date) {
  // Widest possible window: lead time is capped at one day by settings UI.
  const horizon = new Date(now.getTime() + 24 * 3600_000);
  const candidates = await db.reminder.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      archivedAt: null,
      OR: [{ snoozedUntil: { lte: now } }, { snoozedUntil: null, remindAt: { lte: horizon } }],
    },
    take: 500,
    orderBy: { remindAt: "asc" },
  });
  if (!candidates.length) return 0;
  const settings = await settingsFor([...new Set(candidates.map((c) => c.userId))]);
  let fired = 0;

  for (const r of candidates) {
    const s = settings.get(r.userId) ?? null;
    const tz = safeTz(s?.timezone);
    const lead = Math.max(0, s?.reminderLeadMinutes ?? 0) * 60000;
    const snoozed = !!r.snoozedUntil;
    const due = snoozed ? r.snoozedUntil! : new Date(r.remindAt.getTime() - lead);
    if (due > now) continue;
    // Each occurrence fires once. One-time reminders (and finished series) stay
    // ACTIVE — shown as "due" — until the user completes them.
    if (!snoozed && r.lastFiredAt && r.lastFiredAt >= due) continue;

    let nextRemindAt: Date | undefined;
    if (r.recurrence !== "NONE" && r.remindAt.getTime() - lead <= now.getTime()) {
      nextRemindAt = nextOccurrenceTz(r.remindAt, specOf(r), new Date(now.getTime() + lead), tz) ?? undefined;
    }

    // Claim: only one run can win this transition.
    const claim = await db.reminder.updateMany({
      where: { id: r.id, status: "ACTIVE", remindAt: r.remindAt, snoozedUntil: r.snoozedUntil, lastFiredAt: r.lastFiredAt },
      data: {
        lastFiredAt: now,
        snoozedUntil: null,
        // A finished series keeps remindAt on its last occurrence and shows as "due".
        ...(nextRemindAt ? { remindAt: nextRemindAt } : {}),
      },
    });
    if (claim.count !== 1) continue;

    const when = fmtTime(r.remindAt, tz);
    const body = r.notes?.trim() || (snoozed ? `Snoozed reminder` : r.recurrence === "NONE" ? `Due ${when}` : `${KIND_LABEL[r.kind] ?? "Reminder"} · ${when}`);
    await notifyWithActions(r.userId, s, { type: "REMINDER", title: r.title, body: body.slice(0, 200), link: "/reminders", sourceId: r.id }, REMINDER_ACTIONS);
    fired++;
  }
  return fired;
}

// ------------------------------------------------------------ overdue tasks

async function dispatchOverdue(now: Date) {
  const tasks = await db.task.findMany({
    where: {
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      deletedAt: null,
      archivedAt: null,
      dueDate: { lt: now, gte: new Date(now.getTime() - 60 * 864e5) },
    },
    select: { id: true, userId: true, title: true, dueDate: true },
    take: 2000,
  });
  if (!tasks.length) return 0;
  const settings = await settingsFor([...new Set(tasks.map((t) => t.userId))]);
  const byUser = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const s = settings.get(t.userId);
    if (s && !s.notifyOverdue) continue;
    const tz = safeTz(s?.timezone);
    const [todayStart] = dayRange(now, tz);
    // Overdue = due on an earlier local day than today.
    if (!t.dueDate || t.dueDate >= todayStart) continue;
    byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
  }

  let sent = 0;
  for (const [userId, list] of byUser) {
    const s = settings.get(userId) ?? null;
    const tz = safeTz(s?.timezone);
    const [todayStart] = dayRange(now, tz);
    const already = await db.notification.findMany({
      where: { userId, type: "TASK_OVERDUE", createdAt: { gte: todayStart } },
      select: { sourceId: true },
    });
    const seen = new Set(already.map((a) => a.sourceId));
    const today = dayKey(now, tz);
    const summaryId = `overdue:${today}`;
    if (seen.has(summaryId)) continue; // today's summary already covers this user
    const fresh = list.filter((t) => !seen.has(t.id));
    if (!fresh.length) continue;
    if (fresh.length > 3 && seen.size === 0) {
      await notifyWithActions(userId, s, {
        type: "TASK_OVERDUE",
        title: `${fresh.length} tasks are overdue`,
        body: fresh.slice(0, 3).map((t) => t.title).join(" · ").slice(0, 200),
        link: "/tasks",
        sourceId: summaryId,
      });
      sent++;
      continue;
    }
    for (const t of fresh.slice(0, Math.max(0, 5 - seen.size))) {
      await notifyWithActions(userId, s, { type: "TASK_OVERDUE", title: `Overdue: ${t.title}`, body: "This task is past its due date.", link: "/tasks", sourceId: t.id });
      sent++;
    }
  }
  return sent;
}

// ---------------------------------------------------------- calendar alerts

async function dispatchCalendar(now: Date) {
  const events = await db.calendarEvent.findMany({
    where: { deletedAt: null, allDay: false, start: { gt: new Date(now.getTime() - 60000), lte: new Date(now.getTime() + 10 * 60000) } },
    select: { id: true, userId: true, title: true, start: true, location: true },
    take: 500,
  });
  if (!events.length) return 0;
  const settings = await settingsFor([...new Set(events.map((e) => e.userId))]);
  let sent = 0;
  for (const e of events) {
    const s = settings.get(e.userId) ?? null;
    if (s && !s.notifyCalendar) continue;
    const tz = safeTz(s?.timezone);
    const mins = Math.max(0, Math.round((e.start.getTime() - now.getTime()) / 60000));
    const row = await notifyWithActions(e.userId, s, {
      type: "CALENDAR",
      title: e.title,
      body: `${mins <= 0 ? "Starting now" : `Starts in ${mins} min`} · ${fmtTime(e.start, tz)}${e.location ? ` · ${e.location}` : ""}`.slice(0, 200),
      link: "/calendar",
      sourceId: e.id,
      dedupeHours: 12,
    });
    if (row) sent++;
  }
  return sent;
}

// ------------------------------------------------- snoozed notifications

async function resurfaceSnoozed(now: Date) {
  const rows = await db.notification.findMany({ where: { snoozedUntil: { lte: now } }, take: 500 });
  if (!rows.length) return 0;
  const settings = await settingsFor([...new Set(rows.map((r) => r.userId))]);
  let n = 0;
  for (const row of rows) {
    const claim = await db.notification.updateMany({
      where: { id: row.id, snoozedUntil: row.snoozedUntil },
      data: { snoozedUntil: null, readAt: null, createdAt: now },
    });
    if (claim.count !== 1) continue;
    n++;
    const s = settings.get(row.userId);
    if (s?.browserNotifications ?? true) {
      await sendPush(row.userId, { title: row.title, body: row.body ?? undefined, link: row.link ?? undefined, tag: row.sourceId ?? row.id, notificationId: row.id }).catch(() => 0);
    }
  }
  return n;
}

// -------------------------------------------------------------------- run

const g = globalThis as unknown as { __daybookDispatchRunning?: Promise<DispatchResult> };

export type DispatchResult = { reminders: number; overdue: number; calendar: number; resurfaced: number; ms: number; skipped?: boolean };

/** Runs one scheduler pass. Concurrent calls in the same process share the in-flight run. */
export function runDispatcher(now = new Date()): Promise<DispatchResult> {
  if (g.__daybookDispatchRunning) return g.__daybookDispatchRunning.then((r) => ({ ...r, skipped: true }));
  const started = Date.now();
  const p = (async () => {
    const out: DispatchResult = { reminders: 0, overdue: 0, calendar: 0, resurfaced: 0, ms: 0 };
    const step = async (name: keyof Omit<DispatchResult, "ms" | "skipped">, fn: (d: Date) => Promise<number>) => {
      try {
        out[name] = await fn(now);
      } catch (err) {
        console.error(`[dispatcher] ${name} failed`, err);
      }
    };
    await step("reminders", dispatchReminders);
    await step("calendar", dispatchCalendar);
    await step("resurfaced", resurfaceSnoozed);
    await step("overdue", dispatchOverdue);
    out.ms = Date.now() - started;
    return out;
  })();
  g.__daybookDispatchRunning = p;
  return p.finally(() => {
    g.__daybookDispatchRunning = undefined;
  });
}
