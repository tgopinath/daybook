import { db } from "@/lib/db";
import { ApiError, body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { DAY_KEY, moodInput, moodSelect, serializeMood } from "./_lib/shared";

/**
 * Check-ins, newest first. ?from=&to= (inclusive day keys), ?limit= (default 50, max 500),
 * ?cursor= (id of the last item of the previous page).
 */
export const GET = route(async ({ req, user }) => {
  const q = query(req);
  const from = q.get("from");
  const to = q.get("to");
  if (from && !DAY_KEY.safeParse(from).success) throw new ApiError(400, "from: Use yyyy-MM-dd");
  if (to && !DAY_KEY.safeParse(to).success) throw new ApiError(400, "to: Use yyyy-MM-dd");
  const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 50));
  const cursor = q.get("cursor");

  const rows = await db.moodEntry.findMany({
    where: {
      userId: user.id,
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: moodSelect,
  });
  const page = rows.slice(0, limit);
  return { items: page.map(serializeMood), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, moodInput);
  const tz = tzOf(req);
  const today = dayKey(new Date(), tz);
  const date = input.date ?? today;
  if (date > today) throw new ApiError(400, "You can't log a mood for a future day");
  if (input.journalEntryId) {
    const ok = await db.journalEntry.count({ where: { id: input.journalEntryId, userId: user.id } });
    if (!ok) throw new ApiError(404, "Journal entry not found");
  }
  const row = await db.moodEntry.create({
    data: {
      userId: user.id,
      date,
      mood: input.mood,
      intensity: input.intensity ?? 3,
      note: input.note || null,
      factors: input.factors ?? [],
      journalEntryId: input.journalEntryId ?? null,
    },
    select: moodSelect,
  });
  return { item: serializeMood(row) };
});
