import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import type { WeeklyReviewResponse } from "@/components/weekly-review/types";
import { computeWeek, serializeReflection, userWeekStart, weekInfo, weekStartOf } from "./_lib/compute";

const DAY_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");

/** ?week=yyyy-MM-dd (any day of the week; default this week): live stats + saved reflection. */
export const GET = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const todayKey = dayKey(new Date(), tz);
  const ws = await userWeekStart(user.id);
  const raw = query(req).get("week");
  if (raw && !DAY_KEY.safeParse(raw).success) throw new ApiError(400, "week: Use yyyy-MM-dd");
  const start = weekStartOf(raw ?? todayKey, ws);
  const week = weekInfo(start, todayKey, ws);
  if (week.isFuture) throw new ApiError(400, "That week hasn't started yet");
  const [stats, review] = await Promise.all([
    computeWeek(user.id, tz, start, todayKey),
    db.weeklyReview.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart: start } } }),
  ]);
  const out: WeeklyReviewResponse = { week, stats, reflection: serializeReflection(review) };
  return out;
});

const text = z.string().max(5000).nullish();
const reflectionInput = z.object({
  weekStart: DAY_KEY,
  rating: z.number().int().min(1).max(5).nullish(),
  wins: text,
  challenges: text,
  lessons: text,
  nextWeekFocus: text,
});

/** Save (upsert) the written reflection for a week. Only provided fields change. */
export const PUT = route(async ({ req, user }) => {
  const input = await body(req, reflectionInput);
  const todayKey = dayKey(new Date(), tzOf(req));
  const ws = await userWeekStart(user.id);
  const start = weekStartOf(input.weekStart, ws);
  if (start > weekStartOf(todayKey, ws)) throw new ApiError(400, "That week hasn't started yet");
  const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v : null);
  const data = {
    ...(input.rating !== undefined ? { rating: input.rating ?? null } : {}),
    ...(input.wins !== undefined ? { wins: clean(input.wins) } : {}),
    ...(input.challenges !== undefined ? { challenges: clean(input.challenges) } : {}),
    ...(input.lessons !== undefined ? { lessons: clean(input.lessons) } : {}),
    ...(input.nextWeekFocus !== undefined ? { nextWeekFocus: clean(input.nextWeekFocus) } : {}),
  };
  const review = await db.weeklyReview.upsert({
    where: { userId_weekStart: { userId: user.id, weekStart: start } },
    create: { userId: user.id, weekStart: start, ...data },
    update: data,
  });
  return { reflection: serializeReflection(review) };
});
