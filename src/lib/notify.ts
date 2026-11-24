import "server-only";
import type { NotificationType } from "@prisma/client";
import { db } from "./db";
import { sendPush } from "./push";
import { DAILY_CAP, sendReminderMessage, whatsappConfigured } from "./whatsapp";

const PREF: Partial<Record<NotificationType, "notifyOverdue" | "notifyHabits" | "notifyCalendar" | "notifyAI">> = {
  TASK_OVERDUE: "notifyOverdue",
  HABIT: "notifyHabits",
  CALENDAR: "notifyCalendar",
  AI: "notifyAI",
};

/**
 * Records an in-app notification and, if the user allows browser
 * notifications, pushes it to their subscribed devices.
 * `dedupeKey` (usually sourceId) prevents duplicates within `dedupeHours`.
 */
export async function notify(
  userId: string,
  n: { type: NotificationType; title: string; body?: string; link?: string; sourceId?: string; push?: boolean; dedupeHours?: number },
) {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const pref = PREF[n.type];
  if (settings && pref && !settings[pref]) return null;
  if (n.sourceId && n.dedupeHours) {
    const recent = await db.notification.findFirst({
      where: { userId, sourceId: n.sourceId, type: n.type, createdAt: { gte: new Date(Date.now() - n.dedupeHours * 3600_000) } },
    });
    if (recent) return null;
  }
  const row = await db.notification.create({
    data: { userId, type: n.type, title: n.title, body: n.body, link: n.link, sourceId: n.sourceId },
  });
  // WhatsApp: reminders only, to a verified number the user switched on, within the daily cap.
  if (n.type === "REMINDER" && settings?.whatsappReminders && settings.whatsappVerified && settings.whatsappNumber && whatsappConfigured()) {
    try {
      const sentToday = await db.notification.count({ where: { userId, whatsappSent: true, createdAt: { gte: new Date(Date.now() - 864e5) } } });
      if (sentToday < DAILY_CAP) {
        await sendReminderMessage(settings.whatsappNumber, n.title, n.body ?? "Reminder");
        await db.notification.update({ where: { id: row.id }, data: { whatsappSent: true } });
      }
    } catch (err) {
      console.error("WhatsApp delivery failed", err);
    }
  }
  if (n.push !== false && (settings?.browserNotifications ?? true)) {
    // A push failure must never lose the in-app notification.
    try {
      const sent = await sendPush(userId, { title: n.title, body: n.body, link: n.link, tag: n.sourceId ?? row.id, notificationId: row.id });
      if (sent) await db.notification.update({ where: { id: row.id }, data: { delivered: true } });
    } catch (err) {
      console.error("Push delivery failed", err);
    }
  }
  return row;
}
