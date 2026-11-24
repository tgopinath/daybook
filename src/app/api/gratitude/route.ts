import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, query, route } from "@/lib/api";
import { GRATITUDE_PAGE_SIZE } from "@/lib/gratitude";
import { DAY_RE, serializeGratitude } from "./_lib";

/** GET /api/gratitude?from=&to=&cursor=&limit= — entries newest first; cursor = last date seen. */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const from = sp.get("from");
  const to = sp.get("to");
  const cursor = sp.get("cursor");
  for (const v of [from, to, cursor]) if (v && !DAY_RE.test(v)) throw new ApiError(400, "Dates must be yyyy-MM-dd");
  const limit = Math.min(400, Math.max(1, Number(sp.get("limit")) || GRATITUDE_PAGE_SIZE));
  const date: Prisma.StringFilter = {};
  if (from) date.gte = from;
  if (to) date.lte = to;
  if (cursor) date.lt = cursor;
  const rows = await db.gratitudeEntry.findMany({
    where: { userId: user.id, ...(Object.keys(date).length ? { date } : {}) },
    orderBy: { date: "desc" },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return { items: page.map(serializeGratitude), nextCursor: rows.length > limit ? page[page.length - 1]!.date : null };
});
