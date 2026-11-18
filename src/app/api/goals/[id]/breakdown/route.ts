import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { findGoal } from "../../_shared";

type P = { id: string };

/**
 * Deterministic "break into tasks": creates one task per remaining (not done)
 * milestone that has no linked task yet, linked via goalId + milestoneId and
 * due on the milestone's date. Optional { milestoneIds } limits the set.
 */
export const POST = route<P>(async ({ req, user, params }) => {
  const goal = await findGoal(user.id, params.id);
  const { milestoneIds } = await body(req, z.object({ milestoneIds: z.array(z.string()).max(100).optional() }));
  const milestones = await db.milestone.findMany({
    where: {
      goalId: goal.id,
      done: false,
      ...(milestoneIds ? { id: { in: milestoneIds } } : {}),
      tasks: { none: { deletedAt: null } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!milestones.length) return { created: 0, items: [] };
  const settings = await db.userSettings.findUnique({ where: { userId: user.id }, select: { defaultPriority: true } });
  const last = await db.task.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let order = (last?.sortOrder ?? 0) + 1;
  const items = await db.$transaction(
    milestones.map((m) =>
      db.task.create({
        data: {
          userId: user.id,
          title: m.title,
          description: `Milestone for “${goal.title}”`,
          goalId: goal.id,
          milestoneId: m.id,
          dueDate: m.dueDate,
          priority: settings?.defaultPriority ?? "MEDIUM",
          sortOrder: order++,
        },
        select: { id: true, title: true, milestoneId: true, dueDate: true, status: true },
      }),
    ),
  );
  return { created: items.length, items };
});
