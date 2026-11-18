import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";

const schema = z.object({
  taskIds: z
    .array(z.string().min(1))
    .max(3, "Today's Focus holds at most three tasks")
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate task ids"),
});

/**
 * Sets Today's Focus: the given tasks get focusRank 1..n in order, every other
 * task of the user loses its rank. Used for reorder, pin and remove.
 */
export const PATCH = route(async ({ req, user }) => {
  const { taskIds } = await body(req, schema);
  const owned = await db.task.findMany({
    where: { userId: user.id, id: { in: taskIds }, deletedAt: null },
    select: { id: true },
  });
  if (owned.length !== taskIds.length) throw new ApiError(400, "Task not found");

  await db.$transaction([
    db.task.updateMany({
      where: { userId: user.id, focusRank: { not: null }, id: { notIn: taskIds } },
      data: { focusRank: null },
    }),
    ...taskIds.map((id, i) => db.task.updateMany({ where: { id, userId: user.id }, data: { focusRank: i + 1 } })),
  ]);
  return { ok: true, taskIds };
});
