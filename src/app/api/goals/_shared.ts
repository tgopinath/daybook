import "server-only";
import { z } from "zod";
import type { Goal, GoalProgress, Milestone, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { notFound } from "@/lib/api";
import { goalDaysRemaining, goalProgress, goalProgressMode, goalExpectedProgress, GOAL_CATEGORIES } from "@/lib/goals";

/** yyyy-MM-dd (stored at noon UTC so it stays on the same calendar day everywhere) or an ISO timestamp. */
export function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00.000Z`) : new Date(v);
}

const dateish = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || !Number.isNaN(parseDate(v)!.getTime()), "Invalid date");

export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color");
const categories = GOAL_CATEGORIES.map((c) => c.value) as [string, ...string[]];

export const goalFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(categories).optional(),
  startDate: dateish.optional(),
  targetDate: dateish.optional(),
  targetValue: z.number().positive().max(1e12).nullable().optional(),
  currentValue: z.number().min(0).max(1e12).optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ABANDONED"]).optional(),
  color: color.optional(),
};

export const milestoneInput = z.object({
  title: z.string().trim().min(1, "Milestone title is required").max(200),
  dueDate: dateish.optional(),
  done: z.boolean().optional(),
});

export { dateish };

type GoalWithRels = Goal & {
  milestones: Milestone[];
  tasks: { id: string; status: string; completedAt: Date | null }[];
  progressLogs?: GoalProgress[];
};

export const goalInclude = {
  milestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
  tasks: { where: { deletedAt: null, archivedAt: null }, select: { id: true, status: true, completedAt: true } },
} satisfies Prisma.GoalInclude;

/** Adds computed fields every goal response carries. */
export function serializeGoal(g: GoalWithRels, tz: string) {
  const counted = g.tasks.filter((t) => t.status !== "CANCELLED");
  const taskCounts = { total: counted.length, done: counted.filter((t) => t.status === "COMPLETED").length };
  const milestoneCounts = { total: g.milestones.length, done: g.milestones.filter((m) => m.done).length };
  const base = { targetValue: g.targetValue, currentValue: g.currentValue, status: g.status, milestones: g.milestones, taskCounts };
  const { tasks: _tasks, progressLogs: _logs, ...rest } = g;
  const nextMilestone = g.milestones.find((m) => !m.done) ?? null;
  return {
    ...rest,
    progress: goalProgress(base),
    progressMode: goalProgressMode(base),
    expectedProgress: goalExpectedProgress(g.startDate, g.targetDate),
    daysRemaining: goalDaysRemaining(g.targetDate, tz),
    taskCounts,
    milestoneCounts,
    nextMilestone: nextMilestone ? { id: nextMilestone.id, title: nextMilestone.title, dueDate: nextMilestone.dueDate } : null,
  };
}

export async function findGoal(userId: string, id: string) {
  const goal = await db.goal.findFirst({ where: { id, userId } });
  if (!goal) throw notFound("Goal");
  return goal;
}

/** notify() that never fails the request (web push errors are logged, the in-app row is still written). */
export async function safeNotify(...args: Parameters<typeof notify>) {
  try {
    return await notify(...args);
  } catch (err) {
    console.error("notify failed", err);
    return null;
  }
}
