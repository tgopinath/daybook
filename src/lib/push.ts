import "server-only";
import * as webpushModule from "web-push";

// web-push is CommonJS; depending on the bundler the API is on the namespace or on .default.
const webpush = ((webpushModule as unknown as { default?: typeof webpushModule }).default ?? webpushModule) as typeof webpushModule;
import { db } from "./db";

let configured: boolean | null = null;
export function pushConfigured() {
  if (configured === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    configured = false;
    if (pub && priv) {
      try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@localhost", pub, priv);
        configured = true;
      } catch (err) {
        console.error("Web Push disabled: invalid VAPID configuration", err);
      }
    }
  }
  return configured;
}

/** Sends a Web Push message to every subscribed device of the user. Returns devices reached. */
export async function sendPush(userId: string, payload: { title: string; body?: string; link?: string; tag?: string; notificationId?: string; actions?: { action: string; title: string }[] }) {
  if (!pushConfigured()) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
    }),
  );
  return sent;
}
