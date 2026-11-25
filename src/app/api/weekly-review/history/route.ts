import { db } from "@/lib/db";
import { route } from "@/lib/api";
import type { WeeklyReviewHistoryItem } from "@/components/weekly-review/types";
import { weekLabel } from "../_lib/compute";

/** Saved reflections, newest week first (the user's own words only). */
export const GET = route(async ({ user }) => {
  const rows = await db.weeklyReview.findMany({ where: { userId: user.id }, orderBy: { weekStart: "desc" }, take: 104 });
  const items: WeeklyReviewHistoryItem[] = rows
    .filter((r) => r.rating != null || r.wins || r.challenges || r.lessons || r.nextWeekFocus)
    .map((r) => ({
      weekStart: r.weekStart,
      label: weekLabel(r.weekStart),
      rating: r.rating,
      preview: (r.wins || r.lessons || r.nextWeekFocus || r.challenges || "").replace(/\s+/g, " ").trim().slice(0, 140),
      updatedAt: r.updatedAt.toISOString(),
    }));
  return { items };
});
