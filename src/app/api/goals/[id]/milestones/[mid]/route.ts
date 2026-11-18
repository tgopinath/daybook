import { z } from "zod";
import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";
import { dateish, findGoal, parseDate, safeNotify } from "../../../_shared";

type P = { id: string; mid: string };

async function findMilestone(userId: string, goalId: string, mid: string) {
  const goal = await findGoal(userId, goalId);
  const milestone = await db.milestone.findFirst({ where: { id: mid, goalId: goal.id } });
  if (!milestone) throw notFound("Milestone");
  return { goal, milestone };
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    dueDate: dateish.optional(),
    done: z.boolean().optional(),
  })
  .strict();

/** Rename, re-date or toggle a milestone. Completing one sends a GOAL_MILESTONE notification. */
export const PATCH = route<P>(async ({ req, user, params }) => {
  const { goal, milestone } = await findMilestone(user.id, params.id, params.mid);
  const input = await body(req, patchSchema);
  const completing = input.done === true && !milestone.done;
  const item = await db.milestone.update({
    where: { id: milestone.id },
    data: {
      title: input.title,
      dueDate: parseDate(input.dueDate),
      done: input.done,
      completedAt: input.done === undefined ? undefined : input.done ? new Date() : null,
    },
  });
  await db.goal.update({ where: { id: goal.id }, data: { updatedAt: new Date() } });
  if (completing) {
    const counts = await db.milestone.groupBy({ by: ["done"], where: { goalId: goal.id }, _count: true });
    const done = counts.find((c) => c.done)?._count ?? 0;
    const total = counts.reduce((s, c) => s + c._count, 0);
    await safeNotify(user.id, {
      type: "GOAL_MILESTONE",
      title: `Milestone reached: ${item.title}`,
      body: `${goal.title} — ${done} of ${total} milestones done.`,
      link: `/goals/${goal.id}`,
      sourceId: `milestone-${item.id}`,
      dedupeHours: 12,
    });
  }
  return { item };
});

export const DELETE = route<P>(async ({ user, params }) => {
  const { goal, milestone } = await findMilestone(user.id, params.id, params.mid);
  await db.milestone.delete({ where: { id: milestone.id } });
  await db.goal.update({ where: { id: goal.id }, data: { updatedAt: new Date() } });
  return { ok: true };
});
