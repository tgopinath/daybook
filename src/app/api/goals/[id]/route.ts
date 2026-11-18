import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route, tzOf } from "@/lib/api";
import { goalWeeklySeries } from "@/lib/goals";
import { findGoal, goalFields, goalInclude, parseDate, serializeGoal, safeNotify } from "../_shared";

type P = { id: string };

export const GET = route<P>(async ({ req, user, params }) => {
  const goal = await db.goal.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      ...goalInclude,
      progressLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!goal) throw notFound("Goal");
  const tasks = await db.task.findMany({
    where: { userId: user.id, goalId: goal.id, deletedAt: null, archivedAt: null },
    select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true, milestoneId: true, isDemo: true, updatedAt: true },
    orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  const settings = await db.userSettings.findUnique({ where: { userId: user.id }, select: { weekStart: true } });
  const tz = tzOf(req);
  const weekly = goalWeeklySeries({ ...goal, tasks }, tz, 8, new Date(), settings?.weekStart ?? 1);
  return {
    item: {
      ...serializeGoal(goal, tz),
      progressLogs: goal.progressLogs.map((l) => ({ id: l.id, value: l.value, createdAt: l.createdAt })),
      tasks,
      weekly,
    },
  };
});

const patchSchema = z
  .object({
    ...goalFields,
    title: goalFields.title.optional(),
    archived: z.boolean().optional(),
    deletedAt: z.null().optional(),
  })
  .strict();

export const PATCH = route<P>(async ({ req, user, params }) => {
  const existing = await findGoal(user.id, params.id);
  const { archived, deletedAt, startDate, targetDate, ...input } = await body(req, patchSchema);
  const data: Prisma.GoalUpdateInput = { ...input };
  const start = parseDate(startDate);
  if (start) data.startDate = start;
  if (targetDate !== undefined) data.targetDate = parseDate(targetDate);
  if (archived !== undefined) data.archivedAt = archived ? new Date() : null;
  if (deletedAt === null) data.deletedAt = null;
  const valueChanged = input.currentValue !== undefined && input.currentValue !== existing.currentValue;
  if (valueChanged) data.progressLogs = { create: [{ value: input.currentValue! }] };

  const goal = await db.goal.update({ where: { id: existing.id }, data, include: goalInclude });
  if (input.status === "COMPLETED" && existing.status !== "COMPLETED") {
    await safeNotify(user.id, { type: "GOAL_MILESTONE", title: `Goal completed: ${goal.title}`, body: "Nice work — you reached this goal.", link: `/goals/${goal.id}`, sourceId: `goal-done-${goal.id}`, dedupeHours: 24 });
  }
  return { item: serializeGoal(goal, tzOf(req)) };
});

export const DELETE = route<P>(async ({ req, user, params }) => {
  const goal = await findGoal(user.id, params.id);
  if (query(req).get("permanent") === "1") {
    await db.goal.delete({ where: { id: goal.id } });
    return { ok: true, permanent: true };
  }
  await db.goal.update({ where: { id: goal.id }, data: { deletedAt: new Date() } });
  return { ok: true };
});
