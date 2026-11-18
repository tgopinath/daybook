import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { findGoal, milestoneInput, parseDate } from "../../_shared";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => {
  const goal = await findGoal(user.id, params.id);
  const items = await db.milestone.findMany({ where: { goalId: goal.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return { items };
});

/** Add a milestone (appended to the end). */
export const POST = route<P>(async ({ req, user, params }) => {
  const goal = await findGoal(user.id, params.id);
  const input = await body(req, milestoneInput);
  const last = await db.milestone.findFirst({ where: { goalId: goal.id }, orderBy: { sortOrder: "desc" } });
  const item = await db.milestone.create({
    data: { goalId: goal.id, title: input.title, dueDate: parseDate(input.dueDate) ?? null, done: !!input.done, completedAt: input.done ? new Date() : null, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  await db.goal.update({ where: { id: goal.id }, data: { updatedAt: new Date() } });
  return { item };
});

/** Reorder: body { ids: string[] } in the new order. */
export const PUT = route<P>(async ({ req, user, params }) => {
  const goal = await findGoal(user.id, params.id);
  const { ids } = await body(req, z.object({ ids: z.array(z.string()).max(200) }));
  const existing = await db.milestone.findMany({ where: { goalId: goal.id }, select: { id: true } });
  const known = new Set(existing.map((m) => m.id));
  if (ids.some((id) => !known.has(id))) throw new ApiError(400, "Unknown milestone in order");
  await db.$transaction(ids.map((id, i) => db.milestone.update({ where: { id }, data: { sortOrder: i } })));
  const items = await db.milestone.findMany({ where: { goalId: goal.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return { items };
});
