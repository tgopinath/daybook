import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, notFound, route } from "@/lib/api";
import { completeReminder, snoozeReminder } from "@/lib/dispatcher";
import { userTz } from "../../reminders/_shared";

type P = { id: string };

const schema = z.object({
  read: z.boolean().optional(),
  snoozeMinutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
  snoozeUntil: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  /** Used by the service worker's notification buttons. */
  action: z.enum(["done", "snooze"]).optional(),
});

async function find(userId: string, id: string) {
  const n = await db.notification.findFirst({ where: { id, userId } });
  if (!n) throw notFound("Notification");
  return n;
}

/**
 * PATCH /api/notifications/:id
 *  { read: boolean }                         mark read / unread
 *  { snoozeMinutes } | { snoozeUntil: ISO }  hide and resurface later. For
 *     reminder notifications the reminder itself is snoozed (it fires again).
 *  { action: "done" | "snooze" }             service-worker buttons (snooze = 10 min)
 */
export const PATCH = route<P>(async ({ req, user, params }) => {
  const n = await find(user.id, params.id);
  const input = await body(req, schema);
  const now = new Date();

  const reminder =
    n.type === "REMINDER" && n.sourceId ? await db.reminder.findFirst({ where: { id: n.sourceId, userId: user.id, deletedAt: null } }) : null;

  if (input.action === "done") {
    if (reminder && reminder.status === "ACTIVE") {
      // From a push: one-time → completed; recurring → acknowledge, don't skip the next one.
      await completeReminder(reminder, await userTz(req, user.id), { acknowledgeOnly: true });
    }
    await db.notification.update({ where: { id: n.id }, data: { readAt: n.readAt ?? now } });
    return { ok: true };
  }

  const minutes = input.action === "snooze" ? 10 : input.snoozeMinutes;
  const until = input.snoozeUntil ? new Date(input.snoozeUntil) : minutes ? new Date(now.getTime() + minutes * 60000) : null;
  if (until) {
    if (until <= now) throw new ApiError(400, "Snooze time must be in the future");
    if (reminder) {
      await snoozeReminder(reminder, until);
      await db.notification.update({ where: { id: n.id }, data: { readAt: n.readAt ?? now } });
    } else {
      await db.notification.update({ where: { id: n.id }, data: { snoozedUntil: until, readAt: now } });
    }
    return { ok: true, snoozedUntil: until };
  }

  if (input.read !== undefined) {
    const item = await db.notification.update({ where: { id: n.id }, data: { readAt: input.read ? (n.readAt ?? now) : null } });
    return { item };
  }
  throw new ApiError(400, "Nothing to update");
});

export const DELETE = route<P>(async ({ user, params }) => {
  const n = await find(user.id, params.id);
  await db.notification.delete({ where: { id: n.id } });
  return { ok: true };
});
