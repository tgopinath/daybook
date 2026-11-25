import { db } from "@/lib/db";
import { route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { memoryInclude, serializeMemory, serializePhoto } from "@/lib/memories";

/**
 * Memories (and Photo Diary photos) from this month/day in previous years, in the caller's timezone.
 * `?date=yyyy-MM-dd` overrides "today". Each item carries `yearsAgo`.
 */
export const GET = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const override = req.nextUrl.searchParams.get("date");
  const today = override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : dayKey(new Date(), tz);
  const year = Number(today.slice(0, 4));
  const md = today.slice(5);

  // Dates are compared in the user's timezone, so filter in JS over the (small) list of dates.
  const all = await db.memory.findMany({ where: { userId: user.id, deletedAt: null, archivedAt: null }, select: { id: true, date: true } });
  const ids = all.filter((m) => {
    const k = dayKey(m.date, tz);
    return k.slice(5) === md && Number(k.slice(0, 4)) < year;
  }).map((m) => m.id);

  const rows = ids.length
    ? await db.memory.findMany({ where: { id: { in: ids }, userId: user.id }, include: memoryInclude, orderBy: { date: "desc" } })
    : [];
  const items = rows.map((m) => {
    const s = serializeMemory(m, tz);
    return { ...s, yearsAgo: year - Number(s.day.slice(0, 4)) };
  });

  const photoRows = await db.photoEntry.findMany({
    where: { userId: user.id, deletedAt: null, takenOn: { endsWith: `-${md}`, lt: `${year}-01-01` }, media: { status: "ready" } },
    include: { media: true, collection: { select: { id: true, title: true } } },
    orderBy: { takenOn: "desc" },
    take: 24,
  });
  const photos = photoRows.map((p) => ({ ...serializePhoto(p), yearsAgo: year - Number(p.takenOn.slice(0, 4)) }));

  return { date: today, items, photos };
});
