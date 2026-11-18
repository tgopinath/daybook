import { db } from "@/lib/db";
import { ApiError, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { nextOccurrence, type RecurrenceKind } from "@/lib/recurrence";
import { loadEventsInRange, parseRange } from "../events/_lib";

const MAX_PROJECTED_PER_REMINDER = 50;
const MAX_REMINDER_ITEMS = 400;

/**
 * Unified calendar feed: GET /api/calendar?from=ISO&to=ISO
 * → { events, tasks, reminders, importantDates }, everything overlapping [from, to).
 *   events: occurrences (recurring expanded) with occurrenceStart/occurrenceEnd and the base id.
 *   tasks: non-deleted, non-archived tasks with dueDate in range.
 *   reminders: reminders firing in range, plus projected future occurrences of recurring ones.
 *     Sub-daily (HOURLY / interval) reminders are collapsed to one item per day (`repeatsWithinDay`).
 *   importantDates: the birthday/important subset of events.
 */
export const GET = route(async ({ req, user }) => {
  const range = parseRange(query(req));
  if (!range) throw new ApiError(400, "from and to are required");
  const { from, to } = range;
  const tz = tzOf(req);

  const [events, tasks, reminderRows] = await Promise.all([
    loadEventsInRange(user.id, from, to),
    db.task.findMany({
      where: { userId: user.id, deletedAt: null, archivedAt: null, dueDate: { gte: from, lt: to } },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        startTime: true,
        endTime: true,
        status: true,
        priority: true,
        eventId: true,
        categoryId: true,
        completedAt: true,
        isDemo: true,
        updatedAt: true,
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
      take: 1000,
    }),
    db.reminder.findMany({
      where: { userId: user.id, deletedAt: null, archivedAt: null, remindAt: { lt: to } },
      select: {
        id: true,
        title: true,
        notes: true,
        kind: true,
        remindAt: true,
        recurrence: true,
        intervalMinutes: true,
        daysOfWeek: true,
        endsAt: true,
        status: true,
        eventId: true,
        taskId: true,
        isDemo: true,
        updatedAt: true,
      },
      orderBy: { remindAt: "asc" },
      take: 1000,
    }),
  ]);

  type ReminderItem = (typeof reminderRows)[number] & { occurrenceAt: Date; occurrenceKey: string; projected: boolean; repeatsWithinDay: boolean };
  const reminders: ReminderItem[] = [];
  for (const r of reminderRows) {
    const subDaily = r.recurrence === "HOURLY" || (r.recurrence === "CUSTOM" && !!r.intervalMinutes && !r.daysOfWeek.length);
    const seenDays = new Set<string>();
    const add = (at: Date, projected: boolean) => {
      if (subDaily) {
        const k = dayKey(at, tz);
        if (seenDays.has(k)) return;
        seenDays.add(k);
      }
      reminders.push({ ...r, occurrenceAt: at, occurrenceKey: `${r.id}:${at.toISOString()}`, projected, repeatsWithinDay: subDaily });
    };
    if (r.remindAt >= from) add(r.remindAt, false);
    if (r.recurrence === "NONE" || r.status !== "ACTIVE") continue;
    const spec = { recurrence: r.recurrence as RecurrenceKind, intervalMinutes: r.intervalMinutes, daysOfWeek: r.daysOfWeek, endsAt: r.endsAt };
    let occ = nextOccurrence(r.remindAt, spec, r.remindAt >= from ? r.remindAt : new Date(from.getTime() - 1));
    let count = 0;
    // Sub-daily reminders are collapsed per day, so allow more raw steps for them.
    const maxSteps = subDaily ? 2000 : MAX_PROJECTED_PER_REMINDER;
    for (let i = 0; occ && occ < to && i < maxSteps && count < MAX_PROJECTED_PER_REMINDER; i++) {
      const before = reminders.length;
      add(occ, true);
      if (reminders.length > before) count++;
      occ = nextOccurrence(occ, spec, occ);
    }
  }
  reminders.sort((a, b) => a.occurrenceAt.getTime() - b.occurrenceAt.getTime());

  const importantDates = events.filter((e) => e.kind === "birthday" || e.kind === "important");
  return { events, tasks, reminders: reminders.slice(0, MAX_REMINDER_ITEMS), importantDates, range: { from, to } };
});
