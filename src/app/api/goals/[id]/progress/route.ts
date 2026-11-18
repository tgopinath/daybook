import { z } from "zod";
import { db } from "@/lib/db";
import { body, route, tzOf } from "@/lib/api";
import { findGoal, goalInclude, serializeGoal, safeNotify } from "../../_shared";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => {
  const goal = await findGoal(user.id, params.id);
  const items = await db.goalProgress.findMany({ where: { goalId: goal.id }, orderBy: { createdAt: "asc" } });
  return { items };
});

/**
 * Log progress: { value } sets the new current value, { delta } adds to it.
 * Writes a GoalProgress row for the weekly chart.
 */
export const POST = route<P>(async ({ req, user, params }) => {
  const existing = await findGoal(user.id, params.id);
  const input = await body(
    req,
    z.union([z.object({ value: z.number().min(0).max(1e12) }), z.object({ delta: z.number().min(-1e12).max(1e12) })]),
  );
  const value = Math.max(0, "value" in input ? input.value : existing.currentValue + input.delta);
  const goal = await db.goal.update({
    where: { id: existing.id },
    data: { currentValue: value, progressLogs: { create: [{ value }] } },
    include: goalInclude,
  });
  const reached = goal.targetValue != null && value >= goal.targetValue && existing.currentValue < goal.targetValue;
  if (reached) {
    await safeNotify(user.id, {
      type: "GOAL_MILESTONE",
      title: `Target reached: ${goal.title}`,
      body: `You hit ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ""}. Mark the goal complete when you're ready.`,
      link: `/goals/${goal.id}`,
      sourceId: `goal-target-${goal.id}`,
      dedupeHours: 24,
    });
  }
  return { item: serializeGoal(goal, tzOf(req)), reached };
});
