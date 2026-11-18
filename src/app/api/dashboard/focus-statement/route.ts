import { z } from "zod";
import { db } from "@/lib/db";
import { body, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";

const schema = z.object({ text: z.string().max(280, "Keep it under 280 characters") });

/** Today's focus statement. It belongs to the day it was written (in the user's tz). */
export const PUT = route(async ({ req, user }) => {
  const { text } = await body(req, schema);
  const value = text.trim() || null;
  const today = dayKey(new Date(), tzOf(req));
  const s = await db.userSettings.upsert({
    where: { userId: user.id },
    update: { dailyFocus: value, dailyFocusDate: value ? today : null },
    create: { userId: user.id, dailyFocus: value, dailyFocusDate: value ? today : null },
    select: { dailyFocus: true, dailyFocusDate: true },
  });
  return { statement: s.dailyFocus, date: s.dailyFocusDate };
});
