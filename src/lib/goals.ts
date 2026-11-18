// Pure goal helpers shared by API routes, the dashboard, the AI module and the
// client. No server-only imports here so components can use them too.
import type { GoalStatus } from "@prisma/client";
import { addDaysKey, dayKey, weekdayOfKey } from "./time";

export const GOAL_CATEGORIES = [
  { value: "Fitness", label: "Fitness" },
  { value: "Career", label: "Career" },
  { value: "Financial", label: "Financial" },
  { value: "Learning", label: "Learning" },
  { value: "Personal", label: "Personal development" },
  { value: "Family", label: "Family" },
  { value: "Business", label: "Business" },
] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number]["value"];

export function goalCategoryLabel(value: string) {
  return GOAL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const GOAL_STATUS_META: Record<GoalStatus, { label: string; tone: "primary" | "warning" | "success" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "primary" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  ABANDONED: { label: "Abandoned", tone: "neutral" },
};

export const GOAL_COLORS = ["#635BFF", "#20A779", "#E9A23B", "#E45D5D", "#3B9BE9", "#8B5CF6", "#EC4899", "#14B8A6"];

type DateLike = Date | string;
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));

export interface GoalProgressInput {
  targetValue: number | null;
  currentValue: number;
  status?: GoalStatus | string;
  milestones?: { done: boolean }[];
  tasks?: { status: string }[];
  taskCounts?: { total: number; done: number };
}

/** How progress is measured for this goal. */
export function goalProgressMode(g: GoalProgressInput): "value" | "milestones" | "tasks" | "none" {
  if (g.targetValue != null && g.targetValue > 0) return "value";
  if (g.milestones && g.milestones.length > 0) return "milestones";
  const total = g.taskCounts?.total ?? g.tasks?.length ?? 0;
  if (total > 0) return "tasks";
  return "none";
}

/**
 * Progress 0–100. targetValue → current/target; else milestones done/total;
 * else linked tasks completed/total. A COMPLETED goal is always 100.
 */
export function goalProgress(g: GoalProgressInput): number {
  if (g.status === "COMPLETED") return 100;
  const mode = goalProgressMode(g);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  if (mode === "value") return clamp((g.currentValue / g.targetValue!) * 100);
  if (mode === "milestones") return clamp((g.milestones!.filter((m) => m.done).length / g.milestones!.length) * 100);
  if (mode === "tasks") {
    const total = g.taskCounts?.total ?? g.tasks!.length;
    const done = g.taskCounts?.done ?? g.tasks!.filter((t) => t.status === "COMPLETED").length;
    return clamp((done / total) * 100);
  }
  return 0;
}

/** Whole days from today (in tz) to the target date. Negative when overdue, null without a target. */
export function goalDaysRemaining(targetDate: DateLike | null | undefined, tz: string, now: Date = new Date()): number | null {
  if (!targetDate) return null;
  const a = dayKey(now, tz);
  const b = dayKey(toDate(targetDate), tz);
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function describeDaysRemaining(days: number | null): { label: string; tone: "neutral" | "warning" | "danger" } {
  if (days == null) return { label: "No target date", tone: "neutral" };
  if (days < 0) return { label: `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`, tone: "danger" };
  if (days === 0) return { label: "Due today", tone: "warning" };
  if (days === 1) return { label: "1 day left", tone: "warning" };
  return { label: `${days} days left`, tone: days <= 7 ? "warning" : "neutral" };
}

/** Expected progress for a time-boxed goal (how far through the window we are). */
export function goalExpectedProgress(startDate: DateLike, targetDate: DateLike | null, now: Date = new Date()): number | null {
  if (!targetDate) return null;
  const s = toDate(startDate).getTime();
  const e = toDate(targetDate).getTime();
  if (e <= s) return null;
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - s) / (e - s)) * 100)));
}

export interface WeeklyPoint {
  week: string; // yyyy-MM-dd of week start
  label: string; // e.g. "Nov 10"
  progress: number; // progress % at the end of the week
  tasksDone: number; // linked tasks completed during the week
  value: number | null; // logged value at week end (value goals)
}

/**
 * Weekly progress series for the chart: progress at each week's end (from
 * GoalProgress logs for value goals, milestone completions otherwise) and
 * linked tasks completed per week.
 */
export function goalWeeklySeries(
  goal: {
    targetValue: number | null;
    currentValue: number;
    startDate: DateLike;
    milestones: { done: boolean; completedAt: DateLike | null }[];
    progressLogs: { value: number; createdAt: DateLike }[];
    tasks: { status: string; completedAt: DateLike | null }[];
  },
  tz: string,
  weeks = 8,
  now: Date = new Date(),
  weekStart = 1,
): WeeklyPoint[] {
  const today = dayKey(now, tz);
  const back = (weekdayOfKey(today) - weekStart + 7) % 7;
  const thisWeek = addDaysKey(today, -back);
  const logs = [...goal.progressLogs].map((l) => ({ v: l.value, k: dayKey(toDate(l.createdAt), tz) })).sort((a, b) => a.k.localeCompare(b.k));
  const totalTasks = goal.tasks.filter((t) => t.status !== "CANCELLED").length;
  const doneTaskKeys = goal.tasks.filter((t) => t.status === "COMPLETED" && t.completedAt).map((t) => dayKey(toDate(t.completedAt!), tz));
  const msKeys = goal.milestones.filter((m) => m.done).map((m) => (m.completedAt ? dayKey(toDate(m.completedAt), tz) : today));
  const out: WeeklyPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDaysKey(thisWeek, -7 * i);
    const we = addDaysKey(ws, 6);
    const tasksDone = doneTaskKeys.filter((k) => k >= ws && k <= we).length;
    let progress = 0;
    let value: number | null = null;
    if (goal.targetValue && goal.targetValue > 0) {
      const upto = logs.filter((l) => l.k <= we);
      value = upto.length ? upto[upto.length - 1]!.v : i === 0 ? goal.currentValue : 0;
      if (i === 0) value = goal.currentValue;
      progress = Math.min(100, Math.round((value / goal.targetValue) * 100));
    } else if (goal.milestones.length) {
      progress = Math.round((msKeys.filter((k) => k <= we).length / goal.milestones.length) * 100);
    } else if (totalTasks) {
      progress = Math.round((doneTaskKeys.filter((k) => k <= we).length / totalTasks) * 100);
    }
    const [y, m, d] = ws.split("-").map(Number);
    const label = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    out.push({ week: ws, label, progress, tasksDone, value });
  }
  return out;
}

/** Short, factual status line for a goal (used by cards and the AI/dashboard). */
export function goalPaceMessage(progress: number, expected: number | null, days: number | null, status?: string): string | null {
  if (status === "COMPLETED") return "Goal completed";
  if (status && status !== "ACTIVE") return null;
  if (days != null && days < 0 && progress < 100) return "Past the target date";
  if (expected == null) return null;
  const diff = progress - expected;
  if (diff >= 10) return "Ahead of schedule";
  if (diff <= -15) return "Behind schedule";
  return "On track";
}
