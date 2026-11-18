import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";
import { alignToDays } from "@/lib/dispatcher";
import { assertLinks, findReminder, reminderFields, resolveRemindAt, userTz, validateRecurrence, withLinks } from "../_shared";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => {
  const r = await findReminder(user.id, params.id);
  const [item] = await withLinks(user.id, [r]);
  return { item };
});

const patchSchema = reminderFields.partial().extend({
  // Partial must not re-apply defaults.
  kind: reminderFields.shape.kind.removeDefault().optional(),
  recurrence: reminderFields.shape.recurrence.removeDefault().optional(),
  status: z.enum(["ACTIVE", "COMPLETED"]).optional(),
  archived: z.boolean().optional(),
  deletedAt: z.null().optional(),
});

export const PATCH = route<P>(async ({ req, user, params }) => {
  const r = await findReminder(user.id, params.id);
  const input = await body(req, patchSchema);
  const tz = await userTz(req, user.id);
  const data: Prisma.ReminderUncheckedUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.notes !== undefined) data.notes = input.notes || null;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.deletedAt === null) data.deletedAt = null;
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === "ACTIVE" && r.status === "COMPLETED") data.lastFiredAt = null;
  }

  await assertLinks(user.id, input);
  if (input.taskId !== undefined) data.taskId = input.taskId || null;
  if (input.habitId !== undefined) data.habitId = input.habitId || null;
  if (input.eventId !== undefined) data.eventId = input.eventId || null;

  // Schedule changes re-arm the reminder.
  const at = resolveRemindAt(input, tz);
  const scheduleTouched =
    at !== undefined || input.recurrence !== undefined || input.intervalMinutes !== undefined || input.daysOfWeek !== undefined || input.endsAt !== undefined;
  if (scheduleTouched) {
    const spec = {
      recurrence: input.recurrence ?? r.recurrence,
      intervalMinutes: input.intervalMinutes !== undefined ? input.intervalMinutes : r.intervalMinutes,
      daysOfWeek: input.daysOfWeek ?? r.daysOfWeek,
      endsAt: input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : r.endsAt,
    };
    validateRecurrence(spec);
    const base = at ?? r.remindAt;
    Object.assign(data, {
      remindAt: alignToDays(base, spec, tz),
      recurrence: spec.recurrence,
      intervalMinutes: spec.intervalMinutes,
      daysOfWeek: spec.daysOfWeek,
      endsAt: spec.endsAt,
      lastFiredAt: null,
      snoozedUntil: null,
      status: input.status ?? "ACTIVE",
    });
  }

  const updated = await db.reminder.update({ where: { id: r.id }, data });
  const [item] = await withLinks(user.id, [updated]);
  return { item };
});

export const DELETE = route<P>(async ({ req, user, params }) => {
  const r = await findReminder(user.id, params.id);
  if (query(req).get("permanent") === "1") {
    await db.reminder.delete({ where: { id: r.id } });
    return { ok: true, permanent: true };
  }
  await db.reminder.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
  return { ok: true };
});
