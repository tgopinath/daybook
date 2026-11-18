import type { Goal, Milestone, Priority, TaskStatus } from "@prisma/client";
import type { Wire } from "@/lib/client";
import type { WeeklyPoint } from "@/lib/goals";

export type WireMilestone = Wire<Milestone>;

export type GoalListItem = Wire<Goal> & {
  milestones: WireMilestone[];
  progress: number;
  progressMode: "value" | "milestones" | "tasks" | "none";
  expectedProgress: number | null;
  daysRemaining: number | null;
  taskCounts: { total: number; done: number };
  milestoneCounts: { total: number; done: number };
  nextMilestone: { id: string; title: string; dueDate: string | null } | null;
};

export type GoalTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  completedAt: string | null;
  milestoneId: string | null;
  isDemo: boolean;
  updatedAt: string;
};

export type GoalDetail = GoalListItem & {
  progressLogs: { id: string; value: number; createdAt: string }[];
  tasks: GoalTask[];
  weekly: WeeklyPoint[];
};
