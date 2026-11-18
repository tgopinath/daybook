import { db } from "@/lib/db";
import { route } from "@/lib/api";

export const POST = route(async ({ user }) => {
  const { count } = await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return { ok: true, count };
});
