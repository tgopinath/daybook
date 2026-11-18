import { z } from "zod";
import { ApiError, body, route, tzOf } from "@/lib/api";
import { db } from "@/lib/db";
import { zonedToUtc } from "@/lib/time";
import { createTask } from "@/lib/ai/records";
import { toMin } from "@/lib/ai/slots";

export const dynamic = "force-dynamic";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:mm");
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blocks: z
    .array(z.object({ taskId: z.string().max(64).nullish(), title: z.string().trim().max(300).nullish(), start: hhmm, end: hhmm }))
    .min(1)
    .max(40),
});

/**
 * Applies accepted plan blocks (or a manual drag) — sets startTime/endTime/dueDate on
 * existing tasks; blocks without a task become new tasks on that day.
 */
export const POST = route(async ({ req, user }) => {
  const { date, blocks } = await body(req, schema);
  const tz = tzOf(req);
  const results: { taskId: string; title: string; created: boolean }[] = [];
  for (const b of blocks) {
    if (toMin(b.end) <= toMin(b.start)) throw new ApiError(400, `Block ${b.start}–${b.end} ends before it starts`);
    const end = b.end === "24:00" ? "23:59" : b.end;
    if (b.taskId) {
      const task = await db.task.findFirst({ where: { id: b.taskId, userId: user.id, deletedAt: null }, select: { id: true, title: true } });
      if (!task) throw new ApiError(404, "Task not found — it may have been deleted");
      await db.task.update({ where: { id: task.id }, data: { startTime: b.start, endTime: end, dueDate: zonedToUtc(date, end, tz) } });
      results.push({ taskId: task.id, title: task.title, created: false });
    } else {
      if (!b.title) throw new ApiError(400, "A block needs a task or a title");
      const t = await createTask(user.id, tz, { title: b.title, dueDate: date, startTime: b.start, endTime: end });
      results.push({ taskId: t.id, title: t.title, created: true });
    }
  }
  return { updated: results };
});
