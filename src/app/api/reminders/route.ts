import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, query, route } from "@/lib/api";
import { alignToDays } from "@/lib/dispatcher";
import { assertLinks, reminderFields, resolveRemindAt, userTz, validateRecurrence, withLinks } from "./_shared";

/**
 * GET /api/reminders
 *   ?scope=archived | trash  (default: live rows)
 *   ?status=ACTIVE | COMPLETED
 *   ?kind=water…
 */
export const GET = route(async ({ req, user }) => {
  const q = query(req);
  const scope = q.get("scope");
  const where: Prisma.ReminderWhereInput = { userId: user.id };
  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });
  const status = q.get("status");
  if (status === "ACTIVE" || status === "COMPLETED") where.status = status;
  const kind = q.get("kind");
  if (kind) where.kind = kind;
  const rows = await db.reminder.findMany({ where, orderBy: [{ remindAt: "asc" }], take: 500 });
  return { items: await withLinks(user.id, rows) };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, reminderFields);
  const tz = await userTz(req, user.id);
  const at = resolveRemindAt(input, tz);
  if (!at || Number.isNaN(at.getTime())) throw new ApiError(400, "remindAt (or date and time) is required");
  const recurrence = input.recurrence ?? "NONE";
  validateRecurrence({ ...input, recurrence });
  await assertLinks(user.id, input);
  const spec = {
    recurrence,
    intervalMinutes: input.intervalMinutes ?? null,
    daysOfWeek: input.daysOfWeek ?? [],
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  };
  const remindAt = alignToDays(at, spec, tz);
  const created = await db.reminder.create({
    data: {
      userId: user.id,
      title: input.title,
      notes: input.notes || null,
      kind: input.kind ?? "custom",
      remindAt,
      recurrence: spec.recurrence,
      intervalMinutes: spec.intervalMinutes,
      daysOfWeek: spec.daysOfWeek,
      endsAt: spec.endsAt,
      taskId: input.taskId || null,
      habitId: input.habitId || null,
      eventId: input.eventId || null,
    },
  });
  const [item] = await withLinks(user.id, [created]);
  return { item };
});
