import type { Priority, TaskStatus, Recurrence } from "@prisma/client";

export type { Priority, TaskStatus, Recurrence };

export type WireSubtask = { id: string; taskId: string; title: string; done: boolean; sortOrder: number };
export type WireAttachment = { id: string; fileName: string; mimeType: string; size: number; createdAt: string };
export type WireRef = { id: string; name: string; color: string };

/** A task as returned by /api/tasks (see serializeTask in src/lib/tasks.ts). */
export type WireTask = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  startTime: string | null;
  endTime: string | null;
  priority: Priority;
  status: TaskStatus;
  categoryId: string | null;
  projectId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  eventId: string | null;
  recurrence: Recurrence;
  recurrenceRule: string | null;
  reminderAt: string | null;
  focusRank: number | null;
  sortOrder: number;
  completedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  category: WireRef | null;
  project: WireRef | null;
  goal: { id: string; title: string; color: string } | null;
  milestone: { id: string; title: string } | null;
  event: { id: string; title: string; start: string; end: string } | null;
  subtasks: WireSubtask[];
  tags: { id: string; name: string }[];
  attachments: WireAttachment[];
  subtaskCount: number;
  subtaskDone: number;
  attachmentCount: number;
};

export type TaskCounts = { all: number; today: number; upcoming: number; overdue: number; completed: number };
export type TaskList = { items: WireTask[]; counts?: TaskCounts };

/** Values that can prefill the task dialog. `dueDate` / `reminderAt` are ISO strings (or yyyy-MM-dd). */
export type TaskInit = {
  title: string;
  description: string;
  dueDate: string | null;
  startTime: string | null;
  endTime: string | null;
  priority: Priority;
  status: TaskStatus;
  categoryId: string | null;
  projectId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  eventId: string | null;
  recurrence: Recurrence;
  reminderAt: string | null;
  tags: string[];
};

export const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  NOT_STARTED: { label: "Not started", color: "var(--text-3)" },
  IN_PROGRESS: { label: "In progress", color: "var(--primary)" },
  COMPLETED: { label: "Completed", color: "var(--success)" },
  CANCELLED: { label: "Cancelled", color: "var(--text-3)" },
};
export const STATUS_ORDER: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
export const PRIORITY_ORDER: Priority[] = ["HIGH", "MEDIUM", "LOW"];
export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export const isDone = (t: Pick<WireTask, "status">) => t.status === "COMPLETED" || t.status === "CANCELLED";
