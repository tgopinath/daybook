import { query, route, tzOf } from "@/lib/api";
import { getDaySchedule, toDayKey } from "@/lib/ai/context";

export const dynamic = "force-dynamic";

/** GET ?date=yyyy-MM-dd → deterministic day timeline (events, timed tasks, free slots, unscheduled). */
export const GET = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const date = toDayKey(query(req).get("date"), tz);
  return getDaySchedule(user.id, date, tz);
});
