import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
});

/** Stores the browser's PushSubscription (from PushSubscription.toJSON()). */
export const POST = route(async ({ req, user }) => {
  const sub = await body(req, schema);
  if (!sub.endpoint.startsWith("https://")) return Response.json({ error: "Push endpoint must use HTTPS" }, { status: 400 });
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  const devices = await db.pushSubscription.count({ where: { userId: user.id } });
  return { ok: true, devices };
});

/** Number of devices currently subscribed for this user. */
export const GET = route(async ({ user }) => {
  const devices = await db.pushSubscription.count({ where: { userId: user.id } });
  return { devices, configured: !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) };
});
