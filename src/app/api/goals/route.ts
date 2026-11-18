import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import { goalFields, goalInclude, milestoneInput, parseDate, serializeGoal } from "./_shared";

export const GET = route(async ({ req, user }) => {
  const q = query(req);
  const scope = q.get("scope");
  const where: Prisma.GoalWhereInput = { userId: user.id };
  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });
  const status = q.get("status");
  if (status && ["ACTIVE", "ON_HOLD", "COMPLETED", "ABANDONED"].includes(status)) where.status = status as Prisma.GoalWhereInput["status"];
  const category = q.get("category");
  if (category) where.category = category;

  const goals = await db.goal.findMany({
    where,
    include: goalInclude,
    orderBy: scope === "trash" ? { deletedAt: "desc" } : [{ status: "asc" }, { targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const tz = tzOf(req);
  return { items: goals.map((g) => serializeGoal(g, tz)) };
});

const createSchema = z.object({
  ...goalFields,
  milestones: z.array(milestoneInput).max(50).optional(),
});

export const POST = route(async ({ req, user }) => {
  const { milestones, startDate, targetDate, ...input } = await body(req, createSchema);
  const goal = await db.goal.create({
    data: {
      ...input,
      userId: user.id,
      startDate: parseDate(startDate) ?? undefined,
      targetDate: parseDate(targetDate) ?? null,
      milestones: milestones?.length
        ? {
            create: milestones.map((m, i) => ({ title: m.title, dueDate: parseDate(m.dueDate) ?? null, done: !!m.done, completedAt: m.done ? new Date() : null, sortOrder: i })),
          }
        : undefined,
      progressLogs: input.targetValue && input.currentValue ? { create: [{ value: input.currentValue }] } : undefined,
    },
    include: goalInclude,
  });
  return { item: serializeGoal(goal, tzOf(req)) };
});
