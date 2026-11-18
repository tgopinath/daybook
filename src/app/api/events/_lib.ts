import "server-only";
import { z } from "zod";
import type { CalendarEvent, Prisma, Recurrence } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { nextOccurrence, type RecurrenceKind } from "@/lib/recurrence";

export const EVENT_KINDS = ["event", "meeting", "personal", "birthday", "important"] as const;
export const EVENT_RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
/** Reminder rows the calendar creates for events use this kind. */
export const EVENT_REMINDER_KIND = "meeting";
const MAX_OCCURRENCES_PER_EVENT = 500;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color");

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "is required").max(200),
    description: z.string().max(5000).nullish(),
    location: z.string().max(300).nullish(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    allDay: z.boolean().default(false),
    kind: z.enum(EVENT_KINDS).default("event"),
    color: hexColor.nullish(),
    categoryId: z.string().nullish(),
    recurrence: z.enum(EVENT_RECURRENCES).default("NONE"),
    /** Minutes before start for a linked reminder; null/undefined = none. */
    reminderMinutes: z.number().int().min(0).max(60 * 24 * 14).nullish(),
    taskIds: z.array(z.string()).max(100).optional(),
  })
  .refine((v) => v.end.getTime() >= v.start.getTime(), { message: "must be after start", path: ["end"] });

export const eventPatchSchema = z.object({
  title: z.string().trim().min(1, "is required").max(200).optional(),
  description: z.string().max(5000).nullish(),
  location: z.string().max(300).nullish(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  allDay: z.boolean().optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  color: hexColor.nullish(),
  categoryId: z.string().nullish(),
  recurrence: z.enum(EVENT_RECURRENCES).optional(),
  reminderMinutes: z.number().int().min(0).max(60 * 24 * 14).nullish(),
  taskIds: z.array(z.string()).max(100).optional(),
  deletedAt: z.null().optional(),
  archived: z.boolean().optional(), // accepted for contract parity; events cannot be archived
});

export const eventInclude = {
  category: { select: { id: true, name: true, color: true } },
  reminders: { where: { deletedAt: null, kind: EVENT_REMINDER_KIND }, select: { id: true, remindAt: true, recurrence: true }, take: 1 },
  tasks: { where: { deletedAt: null }, select: { id: true, title: true, status: true, priority: true, isDemo: true } },
} satisfies Prisma.CalendarEventInclude;

export type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>;

/** Reminder offset (minutes before start) recovered from the linked reminder row. */
function reminderMinutesOf(e: EventRow): number | null {
  const r = e.reminders[0];
  if (!r) return null;
  const durMs = e.start.getTime() - r.remindAt.getTime();
  if (e.recurrence === "NONE") return Math.max(0, Math.round(durMs / 60000));
  // Recurring: remindAt is aligned to some future occurrence; recover offset modulo the occurrence.
  const occ = nextOccurrence(e.start, { recurrence: e.recurrence as RecurrenceKind }, new Date(r.remindAt.getTime() - 1));
  const base = occ && occ.getTime() >= r.remindAt.getTime() ? occ : e.start;
  return Math.max(0, Math.round((base.getTime() - r.remindAt.getTime()) / 60000));
}

export function serializeEvent(e: EventRow) {
  const { reminders, tasks, ...rest } = e;
  void reminders;
  return {
    ...rest,
    archivedAt: null,
    reminderMinutes: reminderMinutesOf(e),
    reminderId: e.reminders[0]?.id ?? null,
    taskIds: tasks.map((t) => t.id),
    tasks,
  };
}

export type SerializedEvent = ReturnType<typeof serializeEvent>;
export type EventOccurrence = SerializedEvent & { occurrenceStart: Date; occurrenceEnd: Date; occurrenceKey: string };

/** Prisma filter for events that may overlap [from, to) (recurring ones are expanded afterwards). */
export function rangeWhere(userId: string, from: Date, to: Date): Prisma.CalendarEventWhereInput {
  return {
    userId,
    deletedAt: null,
    OR: [
      { recurrence: "NONE", start: { lt: to }, end: { gt: from } },
      { recurrence: { not: "NONE" }, start: { lt: to } },
    ],
  };
}

/** Expand events (including DAILY/WEEKLY/MONTHLY/YEARLY recurrences) into occurrences overlapping [from, to). */
export function expandEvents(events: SerializedEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const e of events) {
    const dur = Math.max(0, e.end.getTime() - e.start.getTime());
    const overlaps = (s: Date) => s.getTime() < to.getTime() && s.getTime() + Math.max(dur, 1) > from.getTime();
    const push = (s: Date) =>
      out.push({ ...e, occurrenceStart: s, occurrenceEnd: new Date(s.getTime() + dur), occurrenceKey: `${e.id}:${s.toISOString()}` });

    if (e.recurrence === "NONE") {
      if (overlaps(e.start)) push(e.start);
      continue;
    }
    const spec = { recurrence: e.recurrence as RecurrenceKind };
    // First occurrence whose end is after `from`.
    let occ: Date | null = overlaps(e.start) || e.start.getTime() >= from.getTime() ? e.start : nextOccurrence(e.start, spec, new Date(from.getTime() - Math.max(dur, 1)));
    for (let i = 0; occ && occ.getTime() < to.getTime() && i < MAX_OCCURRENCES_PER_EVENT; i++) {
      if (overlaps(occ)) push(occ);
      occ = nextOccurrence(e.start, spec, occ);
    }
  }
  return out.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
}

export async function loadEventsInRange(userId: string, from: Date, to: Date, kinds?: string[]) {
  const where = rangeWhere(userId, from, to);
  if (kinds?.length) where.kind = { in: kinds };
  const rows = await db.calendarEvent.findMany({ where, include: eventInclude, orderBy: { start: "asc" }, take: 2000 });
  return expandEvents(rows.map(serializeEvent), from, to);
}

export async function getOwnedEvent(userId: string, id: string) {
  return db.calendarEvent.findFirst({ where: { id, userId }, include: eventInclude });
}

export async function assertCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const c = await db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!c) throw new ApiError(400, "categoryId: category not found");
}

/** remindAt for an event reminder: start − offset, aligned to the next upcoming occurrence for recurring events. */
function reminderTime(event: Pick<CalendarEvent, "start" | "recurrence">, minutes: number): Date {
  const offset = minutes * 60000;
  const first = new Date(event.start.getTime() - offset);
  if (event.recurrence === "NONE" || first.getTime() > Date.now()) return first;
  const next = nextOccurrence(event.start, { recurrence: event.recurrence as RecurrenceKind }, new Date(Date.now() + offset));
  return next ? new Date(next.getTime() - offset) : first;
}

/**
 * Keep the event's linked Reminder row in sync.
 * minutes: undefined = keep the current offset (re-time it if the event moved); null = remove; number = set.
 */
export async function syncEventReminder(
  userId: string,
  event: Pick<CalendarEvent, "id" | "title" | "start" | "recurrence" | "isDemo">,
  minutes: number | null | undefined,
  currentMinutes: number | null,
) {
  const existing = await db.reminder.findFirst({ where: { userId, eventId: event.id, kind: EVENT_REMINDER_KIND, deletedAt: null } });
  const effective = minutes === undefined ? currentMinutes : minutes;
  if (effective === null) {
    if (existing) await db.reminder.deleteMany({ where: { userId, eventId: event.id, kind: EVENT_REMINDER_KIND } });
    return;
  }
  const data = {
    title: event.title,
    remindAt: reminderTime(event, effective),
    recurrence: event.recurrence as Recurrence,
    status: "ACTIVE" as const,
    lastFiredAt: null,
    snoozedUntil: null,
  };
  if (existing) await db.reminder.update({ where: { id: existing.id }, data });
  else await db.reminder.create({ data: { ...data, userId, eventId: event.id, kind: EVENT_REMINDER_KIND, isDemo: false } });
}

/** Make `taskIds` exactly the set of tasks linked to the event (scoped to the user). */
export async function setLinkedTasks(userId: string, eventId: string, taskIds: string[]) {
  await db.$transaction([
    db.task.updateMany({ where: { userId, eventId, id: { notIn: taskIds } }, data: { eventId: null } }),
    db.task.updateMany({ where: { userId, id: { in: taskIds }, deletedAt: null }, data: { eventId } }),
  ]);
}

export function parseRange(sp: URLSearchParams): { from: Date; to: Date } | null {
  const f = sp.get("from");
  const t = sp.get("to");
  if (!f || !t) return null;
  const from = new Date(f);
  const to = new Date(t);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, "from/to must be ISO dates");
  if (to.getTime() <= from.getTime()) throw new ApiError(400, "to must be after from");
  if (to.getTime() - from.getTime() > 400 * 86400000) throw new ApiError(400, "Range is limited to 400 days");
  return { from, to };
}
