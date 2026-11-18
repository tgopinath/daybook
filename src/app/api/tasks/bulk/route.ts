import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { PRIORITIES, STATUSES, mirrorReminderVisibility, purgeTasks, setTaskStatus } from "@/lib/tasks";

const schema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
  action: z.enum(["complete", "uncomplete", "status", "priority", "category", "project", "archive", "unarchive", "delete", "restore", "permanent"]),
  value: z.string().max(64).nullable().optional(),
});

/** POST /api/tasks/bulk { ids, action, value? } → { ok, count, created } */
export const POST = route(async ({ req, user }) => {
  const { ids, action, value } = await body(req, schema);
  const owned = (await db.task.findMany({ where: { userId: user.id, id: { in: ids } }, select: { id: true } })).map((t) => t.id);
  const where = { userId: user.id, id: { in: owned } };
  let created = 0;

  switch (action) {
    case "complete":
    case "uncomplete":
    case "status": {
      const status = action === "complete" ? "COMPLETED" : action === "uncomplete" ? "NOT_STARTED" : value;
      if (!status || !(STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "Invalid status");
      for (const id of owned) {
        const r = await setTaskStatus(user.id, id, status as (typeof STATUSES)[number]);
        if (r.next) created++;
      }
      break;
    }
    case "priority":
      if (!value || !(PRIORITIES as readonly string[]).includes(value)) throw new ApiError(400, "Invalid priority");
      await db.task.updateMany({ where, data: { priority: value as (typeof PRIORITIES)[number] } });
      break;
    case "category":
      if (value && !(await db.category.findFirst({ where: { id: value, userId: user.id } }))) throw new ApiError(400, "Category not found");
      await db.task.updateMany({ where, data: { categoryId: value || null } });
      break;
    case "project":
      if (value && !(await db.project.findFirst({ where: { id: value, userId: user.id } }))) throw new ApiError(400, "Project not found");
      await db.task.updateMany({ where, data: { projectId: value || null } });
      break;
    case "archive":
    case "unarchive": {
      const archivedAt = action === "archive" ? new Date() : null;
      await db.task.updateMany({ where, data: { archivedAt } });
      await mirrorReminderVisibility(user.id, owned, { archivedAt });
      break;
    }
    case "delete":
    case "restore": {
      const deletedAt = action === "delete" ? new Date() : null;
      await db.task.updateMany({ where, data: { deletedAt } });
      await mirrorReminderVisibility(user.id, owned, { deletedAt });
      break;
    }
    case "permanent":
      await purgeTasks(user.id, owned);
      break;
  }
  return { ok: true, count: owned.length, created };
});
