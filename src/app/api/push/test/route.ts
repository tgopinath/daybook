import { db } from "@/lib/db";
import { ApiError, route } from "@/lib/api";
import { pushReady, sendPush } from "@/lib/dispatcher";

/** Sends a real Web Push to every device the user has subscribed. */
export const POST = route(async ({ user }) => {
  if (!pushReady()) throw new ApiError(503, "Web Push is not configured on the server (VAPID keys missing)");
  const devices = await db.pushSubscription.count({ where: { userId: user.id } });
  if (!devices) throw new ApiError(400, "No devices are subscribed yet. Allow notifications in this browser first.");
  const sent = await sendPush(user.id, {
    title: "My Diary notifications are on",
    body: "This is a test. Reminders will appear like this, even when My Diary is closed.",
    link: "/reminders",
    tag: `test-${Date.now()}`,
  });
  if (!sent) throw new ApiError(502, "The push service rejected the message. Try re-enabling notifications in this browser.");
  return { ok: true, sent, devices };
});
