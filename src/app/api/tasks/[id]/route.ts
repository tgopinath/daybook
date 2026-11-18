import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import {
  buildTaskData,
  getTask,
  mirrorReminderVisibility,
  patchTaskSchema,
  purgeTasks,
  serializeTask,
  setSubtasks,
  setTaskStatus,
  setTaskTags,
  syncTaskReminder,
} from "@/lib/tasks";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => {
  return { item: serializeTask(await getTask(user.id, params.id)) };
});

export const PATCH = route<P>(async ({ req, user, params }) => {
  const tz = tzOf(req);
  const input = await body(req, patchTaskSchema);
  const current = await getTask(user.id, params.id);
  const data = await buildTaskData(user.id, input, tz, current);
  if (Object.keys(data).length) await db.task.update({ where: { id: current.id }, data });
  if (input.tags) await setTaskTags(user.id, current.id, input.tags);
  if (input.subtasks) await setSubtasks(current.id, input.subtasks);

  let next = null;
  if (input.status && input.status !== current.status) {
    next = (await setTaskStatus(user.id, current.id, input.status)).next;
  } else {
    const fresh = await db.task.findFirstOrThrow({ where: { id: current.id, userId: user.id } });
    if (input.archived !== undefined || input.deletedAt === null)
      await mirrorReminderVisibility(user.id, [current.id], { archivedAt: fresh.archivedAt, deletedAt: fresh.deletedAt });
    if (input.reminderAt !== undefined || input.title !== undefined) await syncTaskReminder(fresh);
  }
  const item = serializeTask(await getTask(user.id, current.id));
  return { item, next: next ? serializeTask(await getTask(user.id, next.id)) : null };
});

export const DELETE = route<P>(async ({ req, user, params }) => {
  const task = await getTask(user.id, params.id);
  if (query(req).get("permanent") === "1") {
    await purgeTasks(user.id, [task.id]);
    return NextResponse.json({ ok: true, permanent: true });
  }
  const deletedAt = new Date();
  await db.task.update({ where: { id: task.id }, data: { deletedAt } });
  await mirrorReminderVisibility(user.id, [task.id], { deletedAt });
  return { ok: true };
});
