import { db } from "@/lib/db";
import { ApiError, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";

/** Days in a month with entries: { days: [{ date, count, mood }] } (mood = latest entry's mood that day). */
export const GET = route(async ({ req, user }) => {
  const month = query(req).get("month") ?? dayKey(new Date(), tzOf(req)).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400, "month must be yyyy-MM");
  const rows = await db.journalEntry.findMany({
    where: { userId: user.id, deletedAt: null, archivedAt: null, entryDate: { startsWith: `${month}-` } },
    select: { entryDate: true, mood: true },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  });
  const days = new Map<string, { date: string; count: number; mood: string | null }>();
  for (const r of rows) {
    const d = days.get(r.entryDate) ?? { date: r.entryDate, count: 0, mood: null };
    d.count++;
    if (r.mood) d.mood = r.mood;
    days.set(r.entryDate, d);
  }
  return { month, days: [...days.values()] };
});
