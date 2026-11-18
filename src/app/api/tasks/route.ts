import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import {
  OPEN,
  buildTaskData,
  createTaskSchema,
  getTask,
  parseBound,
  serializeTask,
  setSubtasks,
  setTaskStatus,
  setTaskTags,
  smartCounts,
  smartWhere,
  syncTaskReminder,
  taskInclude,
} from "@/lib/tasks";

/**
 * GET /api/tasks
 *   ?scope=archived|trash
 *   ?view=all|active|today|upcoming|overdue|completed
 *   &goalId= &eventId= &categoryId= &projectId= &tag= &priority= &status=
 *   &from= &to=   (dueDate bounds; yyyy-MM-dd in caller tz, or ISO)
 *   &q=           (title / description / tag name)
 *   &limit=
 * → { items, counts }
 */
export const GET = route(async ({ req, user }) => {
  const p = query(req);
  const tz = tzOf(req);
  const scope = p.get("scope");
  const where: Prisma.TaskWhereInput = { userId: user.id };
  const and: Prisma.TaskWhereInput[] = [];

  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });

  const view = p.get("view") ?? "all";
  if (!scope) and.push(smartWhere(view, tz));

  for (const k of ["goalId", "eventId", "categoryId", "projectId", "milestoneId"] as const) {
    const v = p.get(k);
    if (v) and.push({ [k]: v === "none" ? null : v });
  }
  const priority = p.get("priority");
  if (priority && ["HIGH", "MEDIUM", "LOW"].includes(priority)) and.push({ priority: priority as "HIGH" });
  const status = p.get("status");
  if (status) {
    const list = status.split(",").filter((s) => ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(s));
    if (list.length) and.push({ status: { in: list as typeof OPEN } });
  }
  const tag = p.get("tag");
  if (tag) and.push({ tags: { some: { OR: [{ tagId: tag }, { tag: { name: { equals: tag, mode: "insensitive" } } }] } } });
  const from = parseBound(p.get("from"), tz);
  const to = parseBound(p.get("to"), tz, true);
  if (from || to) and.push({ dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  const q = p.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    scope === "trash"
      ? [{ deletedAt: "desc" }]
      : scope === "archived"
        ? [{ archivedAt: "desc" }]
        : view === "completed"
          ? [{ completedAt: "desc" }]
          : [{ sortOrder: "asc" }, { createdAt: "asc" }];
  const limit = Math.min(Number(p.get("limit")) || 500, 1000);

  const [rows, counts] = await Promise.all([
    db.task.findMany({ where, include: taskInclude, orderBy, take: limit }),
    p.get("counts") === "0" ? Promise.resolve(undefined) : smartCounts(user.id, tz),
  ]);
  return { items: rows.map(serializeTask), counts };
});

export const POST = route(async ({ req, user }) => {
  const tz = tzOf(req);
  const input = await body(req, createTaskSchema);
  const data = await buildTaskData(user.id, input, tz);
  let priority = input.priority;
  if (!priority) {
    const s = await db.userSettings.findUnique({ where: { userId: user.id }, select: { defaultPriority: true } });
    priority = s?.defaultPriority ?? "MEDIUM";
  }
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const first = await db.task.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "asc" }, select: { sortOrder: true } });
    sortOrder = (first?.sortOrder ?? 0) - 1; // new tasks go to the top
  }
  const created = await db.task.create({
    data: {
      ...(data as Prisma.TaskUncheckedCreateInput),
      title: input.title,
      userId: user.id,
      priority,
      sortOrder,
    },
  });
  if (input.tags?.length) await setTaskTags(user.id, created.id, input.tags);
  if (input.subtasks?.length) await setSubtasks(created.id, input.subtasks);
  if (input.status && input.status !== "NOT_STARTED") await setTaskStatus(user.id, created.id, input.status);
  else await syncTaskReminder(created);
  return { item: serializeTask(await getTask(user.id, created.id)) };
});
