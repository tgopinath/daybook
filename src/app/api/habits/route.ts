import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { habitsDailyMessage } from "@/lib/habits";
import { habitFields, normaliseSchedule, serializeHabit, syncHabitReminder } from "./_shared";

export const GET = route(async ({ req, user }) => {
  const scope = query(req).get("scope");
  const where: Prisma.HabitWhereInput = { userId: user.id };
  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });

  const habits = await db.habit.findMany({
    where,
    include: { entries: { select: { date: true, count: true }, orderBy: { date: "asc" } } },
    orderBy: scope === "trash" ? { deletedAt: "desc" } : { createdAt: "asc" },
  });
  const tz = tzOf(req);
  const todayKey = dayKey(new Date(), tz);
  const items = habits.map(({ entries, ...h }) => serializeHabit(h, entries, tz, todayKey));
  const due = items.filter((h) => h.scheduledToday);
  return {
    items,
    todayKey,
    summary: {
      scheduledToday: due.length,
      doneToday: due.filter((h) => h.doneToday).length,
      bestCurrentStreak: items.reduce((m, h) => Math.max(m, h.streak), 0),
      message: habitsDailyMessage(items),
    },
  };
});

export const POST = route(async ({ req, user }) => {
  const input = normaliseSchedule(await body(req, z.object(habitFields)));
  const habit = await db.habit.create({ data: { ...input, userId: user.id } });
  await syncHabitReminder(habit, tzOf(req));
  const tz = tzOf(req);
  return { item: serializeHabit(habit, [], tz, dayKey(new Date(), tz)) };
});
