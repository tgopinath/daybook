import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { query, route } from "@/lib/api";

const TYPES = ["REMINDER", "TASK_OVERDUE", "GOAL_MILESTONE", "HABIT", "CALENDAR", "AI", "SYSTEM"];

/**
 * GET /api/notifications?unread=1&type=REMINDER&limit=50
 * Snoozed notifications are hidden until the dispatcher resurfaces them.
 * Returns { items, unread } where unread is the total unread count.
 */
export const GET = route(async ({ req, user }) => {
  const q = query(req);
  const now = new Date();
  const visible: Prisma.NotificationWhereInput = { userId: user.id, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const where: Prisma.NotificationWhereInput = { ...visible };
  if (q.get("unread") === "1") where.readAt = null;
  const type = q.get("type");
  if (type && TYPES.includes(type)) where.type = type as NotificationType;
  const limit = Math.min(200, Math.max(1, Number(q.get("limit")) || 50));
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    db.notification.count({ where: { ...visible, readAt: null } }),
  ]);
  return { items, unread };
});
