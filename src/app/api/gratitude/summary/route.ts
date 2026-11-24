import { db } from "@/lib/db";
import { ApiError, query, route, tzOf } from "@/lib/api";
import { addDaysKey, dayKey, weekdayOfKey } from "@/lib/time";
import { cleanItems, gratitudeStreak, topWords } from "@/lib/gratitude";

/**
 * GET /api/gratitude/summary?range=week|month&offset=0
 * Counts, streaks, most frequent words and the period's gratitude list (offset -1 = previous period).
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const range = sp.get("range") ?? "week";
  if (range !== "week" && range !== "month") throw new ApiError(400, "range must be week or month");
  const offset = Math.min(0, Math.max(-120, Math.trunc(Number(sp.get("offset")) || 0)));
  const today = dayKey(new Date(), tzOf(req));

  let from: string;
  let to: string;
  if (range === "week") {
    const settings = await db.userSettings.findUnique({ where: { userId: user.id }, select: { weekStart: true } });
    const weekStart = settings?.weekStart ?? 1;
    const back = (weekdayOfKey(today) - weekStart + 7) % 7;
    from = addDaysKey(addDaysKey(today, -back), offset * 7);
    to = addDaysKey(from, 6);
  } else {
    const [y, m] = today.split("-").map(Number);
    const first = new Date(Date.UTC(y!, m! - 1 + offset, 1));
    from = first.toISOString().slice(0, 10);
    to = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }

  const all = await db.gratitudeEntry.findMany({ where: { userId: user.id }, select: { date: true, items: true, note: true }, orderBy: { date: "asc" } });
  const filled = all.filter((r) => cleanItems(r.items).length);
  const inRange = filled.filter((r) => r.date >= from && r.date <= to);
  const elapsedEnd = to < today ? to : today;
  const totalDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const elapsedDays = elapsedEnd < from ? 0 : Math.round((Date.parse(`${elapsedEnd}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const items = inRange.flatMap((r) => cleanItems(r.items).map((text) => ({ date: r.date, text })));

  return {
    range,
    offset,
    from,
    to,
    today,
    daysFilled: inRange.length,
    totalDays,
    elapsedDays,
    itemsCount: items.length,
    streak: gratitudeStreak(filled.map((r) => r.date), today),
    topWords: topWords([...items.map((i) => i.text), ...inRange.map((r) => r.note ?? "")], 10),
    items: items.reverse(),
    totalEntries: filled.length,
  };
});
