import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { findHabit, habitFields, normaliseSchedule, serializeHabit, syncHabitReminder } from "../_shared";

type P = { id: string };

export const GET = route<P>(async ({ req, user, params }) => {
  const habit = await findHabit(user.id, params.id);
  const entries = await db.habitEntry.findMany({ where: { habitId: habit.id }, select: { date: true, count: true }, orderBy: { date: "asc" } });
  const tz = tzOf(req);
  const reminder = await db.reminder.findFirst({ where: { userId: user.id, habitId: habit.id }, select: { id: true, remindAt: true, recurrence: true } });
  return { item: { ...serializeHabit(habit, entries, tz, dayKey(new Date(), tz), 371), reminder } };
});

const patchSchema = z
  .object({
    ...habitFields,
    name: habitFields.name.optional(),
    archived: z.boolean().optional(),
    deletedAt: z.null().optional(),
  })
  .strict();

export const PATCH = route<P>(async ({ req, user, params }) => {
  const existing = await findHabit(user.id, params.id);
  const { archived, deletedAt, ...raw } = await body(req, patchSchema);
  const input = raw.frequency !== undefined || raw.daysOfWeek !== undefined ? normaliseSchedule(raw, existing) : raw;
  const data: Prisma.HabitUpdateInput = { ...input };
  if (archived !== undefined) data.archivedAt = archived ? new Date() : null;
  if (deletedAt === null) data.deletedAt = null;
  const habit = await db.habit.update({ where: { id: existing.id }, data });
  const tz = tzOf(req);
  await syncHabitReminder(habit, tz);
  const entries = await db.habitEntry.findMany({ where: { habitId: habit.id }, select: { date: true, count: true }, orderBy: { date: "asc" } });
  return { item: serializeHabit(habit, entries, tz, dayKey(new Date(), tz)) };
});

export const DELETE = route<P>(async ({ req, user, params }) => {
  const habit = await findHabit(user.id, params.id);
  if (query(req).get("permanent") === "1") {
    await db.reminder.deleteMany({ where: { userId: user.id, habitId: habit.id } });
    await db.habit.delete({ where: { id: habit.id } });
    return { ok: true, permanent: true };
  }
  const updated = await db.habit.update({ where: { id: habit.id }, data: { deletedAt: new Date() } });
  await syncHabitReminder(updated, tzOf(req));
  return { ok: true };
});
