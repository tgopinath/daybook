"use client";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { toast, toastError } from "@/components/ui/toast";
import type { GoalListItem } from "./types";

const sync = () => refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);

export async function archiveGoal(goal: Pick<GoalListItem, "id" | "title">, archived = true) {
  try {
    await api.patch(`/api/goals/${goal.id}`, { archived });
    await sync();
    if (archived) toast.undo(`Archived “${goal.title}”`, () => void archiveGoal(goal, false));
    else toast.success("Goal restored from archive");
  } catch (err) {
    toastError(err);
  }
}

export async function deleteGoal(goal: Pick<GoalListItem, "id" | "title">, after?: () => void) {
  try {
    await api.delete(`/api/goals/${goal.id}`);
    await sync();
    after?.();
    toast.undo(`Deleted “${goal.title}”`, async () => {
      try {
        await api.patch(`/api/goals/${goal.id}`, { deletedAt: null });
        await sync();
        toast.success("Goal restored");
      } catch (err) {
        toastError(err);
      }
    });
  } catch (err) {
    toastError(err);
  }
}

export async function setGoalStatus(goal: Pick<GoalListItem, "id">, status: GoalListItem["status"]) {
  try {
    await api.patch(`/api/goals/${goal.id}`, { status });
    await sync();
    toast.success(status === "COMPLETED" ? "Goal marked complete" : "Status updated");
  } catch (err) {
    toastError(err);
  }
}

/** Copies the goal (and its milestones, reset to not done) as a fresh active goal. */
export async function duplicateGoal(goal: GoalListItem): Promise<GoalListItem | null> {
  try {
    const res = await api.post<{ item: GoalListItem }>("/api/goals", {
      title: `${goal.title} (copy)`.slice(0, 200),
      description: goal.description,
      category: goal.category,
      color: goal.color,
      targetDate: goal.targetDate,
      targetValue: goal.targetValue,
      currentValue: 0,
      unit: goal.unit,
      notes: goal.notes,
      milestones: goal.milestones.map((m) => ({ title: m.title, dueDate: m.dueDate })),
    });
    await sync();
    toast.success("Goal duplicated");
    return res.item;
  } catch (err) {
    toastError(err);
    return null;
  }
}
