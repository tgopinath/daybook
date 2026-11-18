import { z } from "zod";
import { body, query, route, tzOf } from "@/lib/api";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET ?date= → the daily focus statement for that day (UserSettings.dailyFocus/dailyFocusDate). */
export const GET = route(async ({ req, user }) => {
  const date = query(req).get("date") || dayKey(new Date(), tzOf(req));
  const s = await db.userSettings.findUnique({ where: { userId: user.id }, select: { dailyFocus: true, dailyFocusDate: true } });
  return { date, focus: s?.dailyFocusDate === date ? (s.dailyFocus ?? "") : "" };
});

const schema = z.object({ focus: z.string().trim().max(280), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const PUT = route(async ({ req, user }) => {
  const { focus, date: d } = await body(req, schema);
  const date = d ?? dayKey(new Date(), tzOf(req));
  const data = { dailyFocus: focus || null, dailyFocusDate: focus ? date : null };
  await db.userSettings.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
  return { date, focus };
});
