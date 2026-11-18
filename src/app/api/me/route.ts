import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { hasDemoData } from "@/lib/demo";

export const GET = route(async ({ user }) => {
  const settings = await db.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  return { user, settings, hasDemoData: await hasDemoData(user.id) };
});
