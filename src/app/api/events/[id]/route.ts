import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, notFound, query, route } from "@/lib/api";
import { assertCategory, eventPatchSchema, getOwnedEvent, serializeEvent, setLinkedTasks, syncEventReminder } from "../_lib";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const e = await getOwnedEvent(user.id, params.id);
  if (!e) throw notFound("Event");
  return { item: serializeEvent(e) };
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, eventPatchSchema);
  let existing = await getOwnedEvent(user.id, params.id);
  if (!existing) throw notFound("Event");

  // Restore from trash: bring back reminders that were soft-deleted together with the event.
  if (input.deletedAt === null && existing.deletedAt) {
    await db.reminder.updateMany({ where: { userId: user.id, eventId: existing.id, deletedAt: existing.deletedAt }, data: { deletedAt: null } });
    existing = (await getOwnedEvent(user.id, params.id))!;
  }
  const current = serializeEvent(existing);

  const start = input.start ?? existing.start;
  const end = input.end ?? existing.end;
  if (end.getTime() < start.getTime()) throw new ApiError(400, "end: must be after start");
  if (input.categoryId !== undefined) await assertCategory(user.id, input.categoryId);

  const data: Prisma.CalendarEventUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.location !== undefined) data.location = input.location || null;
  if (input.start !== undefined) data.start = input.start;
  if (input.end !== undefined) data.end = input.end;
  if (input.allDay !== undefined) data.allDay = input.allDay;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.color !== undefined) data.color = input.color ?? null;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId || null;
  if (input.recurrence !== undefined) data.recurrence = input.recurrence;
  if (input.deletedAt === null) data.deletedAt = null;

  const updated = await db.calendarEvent.update({ where: { id: existing.id }, data });

  const timingChanged = input.start !== undefined || input.recurrence !== undefined || input.title !== undefined;
  if (!updated.deletedAt && (input.reminderMinutes !== undefined || timingChanged)) {
    await syncEventReminder(user.id, updated, input.reminderMinutes, current.reminderMinutes);
  }
  if (input.taskIds) await setLinkedTasks(user.id, updated.id, input.taskIds);

  const full = await getOwnedEvent(user.id, updated.id);
  return { item: serializeEvent(full!) };
});

/** Soft delete (with its reminder); ?permanent=1 hard-deletes the event and its reminders. */
export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const existing = await db.calendarEvent.findFirst({ where: { id: params.id, userId: user.id } });
  if (!existing) throw notFound("Event");
  if (query(req).get("permanent") === "1") {
    await db.$transaction([
      db.reminder.deleteMany({ where: { userId: user.id, eventId: existing.id } }),
      db.calendarEvent.delete({ where: { id: existing.id } }),
    ]);
    return { ok: true, permanent: true };
  }
  const now = new Date();
  await db.$transaction([
    db.calendarEvent.update({ where: { id: existing.id }, data: { deletedAt: now } }),
    db.reminder.updateMany({ where: { userId: user.id, eventId: existing.id, deletedAt: null }, data: { deletedAt: now } }),
  ]);
  return { ok: true, deletedAt: now };
});
