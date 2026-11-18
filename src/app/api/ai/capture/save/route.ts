import { body, route, tzOf } from "@/lib/api";
import { captureSaveSchema } from "@/lib/ai/capture-schema";
import { createEvent, createHabit, createNote, createReminder, createTask } from "@/lib/ai/records";
import { dayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Creates the record a Quick Capture describes, directly via Prisma (user-scoped). */
export const POST = route(async ({ req, user }) => {
  const c = await body(req, captureSaveSchema);
  const tz = tzOf(req);
  const userId = user.id;
  const r: { kind: "NONE" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; intervalMinutes?: number | null; daysOfWeek?: number[] | null } = c.recurrence ?? { kind: "NONE" };

  switch (c.intent) {
    case "task": {
      const t = await createTask(userId, tz, {
        title: c.title,
        description: c.notes,
        dueDate: c.date ?? (c.time ? dayKey(new Date(), tz) : null),
        startTime: c.time,
        endTime: c.endTime,
        priority: c.priority,
        categoryName: c.category,
        recurrence: r.kind === "HOURLY" ? "DAILY" : r.kind,
      });
      return { kind: "task", id: t.id, title: t.title, href: "/tasks" };
    }
    case "reminder": {
      const rem = await createReminder(userId, tz, {
        title: c.title,
        notes: c.notes,
        remindAt: c.date || c.time ? `${c.date ?? dayKey(new Date(), tz)}T${c.time ?? "09:00"}` : null,
        recurrence: r.kind,
        intervalMinutes: r.kind === "HOURLY" ? (r.intervalMinutes ?? 60) : null,
        daysOfWeek: r.daysOfWeek ?? [],
      });
      return { kind: "reminder", id: rem.id, title: rem.title, href: "/reminders", at: rem.remindAt.toISOString() };
    }
    case "event": {
      const date = c.date ?? dayKey(new Date(), tz);
      const e = await createEvent(userId, tz, {
        title: c.title,
        description: c.notes,
        start: c.time ? `${date}T${c.time}` : date,
        end: c.time && c.endTime ? `${date}T${c.endTime}` : null,
        allDay: !c.time,
        kind: /meet|sync|standup|1:1|interview/i.test(c.title) ? "meeting" : "event",
        categoryName: c.category,
        recurrence: r.kind === "HOURLY" ? "NONE" : r.kind,
      });
      return { kind: "event", id: e.id, title: e.title, href: "/calendar" };
    }
    case "habit": {
      const h = await createHabit(userId, {
        name: c.title,
        description: c.notes,
        daysOfWeek: r.kind === "WEEKLY" && r.daysOfWeek?.length ? r.daysOfWeek : null,
        reminderTime: c.time,
      });
      return { kind: "habit", id: h.id, title: h.name, href: "/habits" };
    }
    case "note": {
      const n = await createNote(userId, { title: c.title, text: c.notes ?? "", categoryName: c.category });
      return { kind: "note", id: n.id, title: n.title, href: "/notes" };
    }
  }
});
