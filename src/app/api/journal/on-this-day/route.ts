import { db } from "@/lib/db";
import { ApiError, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { DAY_RE, journalListSelect, toListItem } from "../_lib";

/** Entries written on the same calendar day in earlier years (newest first). */
export const GET = route(async ({ req, user }) => {
  const date = query(req).get("date") ?? dayKey(new Date(), tzOf(req));
  if (!DAY_RE.test(date)) throw new ApiError(400, "date must be yyyy-MM-dd");
  const rows = await db.journalEntry.findMany({
    where: { userId: user.id, deletedAt: null, archivedAt: null, isDraft: false, entryDate: { endsWith: date.slice(4), lt: `${date.slice(0, 4)}-01-01` } },
    select: journalListSelect,
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 20,
  });
  return { date, items: rows.map(toListItem) };
});
