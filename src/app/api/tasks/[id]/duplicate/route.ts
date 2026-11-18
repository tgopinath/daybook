import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { getTask, serializeTask, syncTaskReminder } from "@/lib/tasks";

export const POST = route<{ id: string }>(async ({ user, params }) => {
  const t = await getTask(user.id, params.id);
  const copy = await db.task.create({
    data: {
      userId: user.id,
      title: `${t.title} (copy)`.slice(0, 300),
      description: t.description,
      dueDate: t.dueDate,
      startTime: t.startTime,
      endTime: t.endTime,
      priority: t.priority,
      status: t.status === "COMPLETED" || t.status === "CANCELLED" ? "NOT_STARTED" : t.status,
      categoryId: t.categoryId,
      projectId: t.projectId,
      goalId: t.goalId,
      milestoneId: t.milestoneId,
      eventId: t.eventId,
      recurrence: t.recurrence,
      recurrenceRule: t.recurrenceRule,
      reminderAt: t.reminderAt,
      sortOrder: t.sortOrder + 0.001,
      subtasks: { create: t.subtasks.map((s, i) => ({ title: s.title, done: s.done, sortOrder: i })) },
      tags: { create: t.tags.map((x) => ({ tagId: x.tagId })) },
    },
  });
  await syncTaskReminder(copy);
  return { item: serializeTask(await getTask(user.id, copy.id)) };
});
