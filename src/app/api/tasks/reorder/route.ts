import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { STATUSES, setTaskStatus } from "@/lib/tasks";

const schema = z.object({
  /** Task ids in their new visual order; each gets sortOrder = index. */
  order: z.array(z.string().min(1).max(64)).max(1000),
  /** Optional kanban move: the dragged task and the column it landed in. */
  move: z.object({ id: z.string().min(1).max(64), status: z.enum(STATUSES) }).optional(),
});

/** POST /api/tasks/reorder { order: string[], move?: { id, status } } */
export const POST = route(async ({ req, user }) => {
  const { order, move } = await body(req, schema);
  const owned = new Set(
    (await db.task.findMany({ where: { userId: user.id, id: { in: order } }, select: { id: true } })).map((t) => t.id),
  );
  await db.$transaction(
    order.filter((id) => owned.has(id)).map((id, i) => db.task.update({ where: { id }, data: { sortOrder: i } })),
  );
  let next = null;
  if (move) {
    const t = await db.task.findFirst({ where: { id: move.id, userId: user.id }, select: { status: true } });
    if (t && t.status !== move.status) next = (await setTaskStatus(user.id, move.id, move.status)).next;
  }
  return { ok: true, next: next ? { id: next.id, dueDate: next.dueDate } : null };
});
