// Client-safe AI types shared by API routes and UI. No server imports here.

export type ToolCallStatus = "pending" | "done" | "rejected" | "error";

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  readOnly: boolean;
  /** Short human summary of the outcome (e.g. "Created task “Pay bill”"). */
  summary?: string;
  /** Raw result returned by the executor (read-only tools: what the model saw). */
  result?: unknown;
  error?: string;
  /** Titles behind ids, for display (e.g. { taskTitle, goalTitle }). */
  context?: Record<string, string>;
  /** Where the created/updated record lives in the app. */
  link?: { kind: "task" | "reminder" | "event" | "note" | "goal" | "tasks"; id?: string; href?: string };
}

export interface WireAIMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolCalls: ToolCallRecord[] | null;
  createdAt: string;
}

export interface WireConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

export interface AIStatus {
  configured: boolean;
  provider: "anthropic" | "openai";
  model: string;
  /** Human explanation when not configured. */
  message?: string;
}

export const NOT_CONFIGURED_MESSAGE = "AI isn't configured — add ANTHROPIC_API_KEY (or OPENAI_API_KEY) to .env";

export const READ_TOOLS = ["get_overview", "search", "list_tasks", "get_goal", "get_schedule", "get_week_summary"] as const;
export const WRITE_TOOLS = [
  "create_task",
  "update_task",
  "create_tasks_for_goal",
  "create_reminder",
  "create_event",
  "create_note",
  "complete_task",
] as const;
export type ReadToolName = (typeof READ_TOOLS)[number];
export type WriteToolName = (typeof WRITE_TOOLS)[number];

export const isWriteTool = (name: string): name is WriteToolName => (WRITE_TOOLS as readonly string[]).includes(name);

export const TOOL_LABELS: Record<string, string> = {
  get_overview: "Looked at today",
  search: "Searched",
  list_tasks: "Listed tasks",
  get_goal: "Opened goal",
  get_schedule: "Checked schedule",
  get_week_summary: "Reviewed the week",
  create_task: "Create task",
  update_task: "Update task",
  create_tasks_for_goal: "Create tasks for goal",
  create_reminder: "Create reminder",
  create_event: "Create event",
  create_note: "Create note",
  complete_task: "Complete task",
};

/* ---------------- Planner ---------------- */

export interface PlanBlock {
  start: string; // HH:mm
  end: string; // HH:mm
  taskId?: string | null;
  title: string;
  reason?: string;
}

export interface DaySchedule {
  date: string;
  isToday: boolean;
  now: string | null; // HH:mm when isToday
  workStart: string;
  workEnd: string;
  events: { id: string; title: string; start: string; end: string; allDay: boolean; kind: string; color: string | null }[];
  timedTasks: { id: string; title: string; start: string; end: string; priority: "HIGH" | "MEDIUM" | "LOW"; status: string }[];
  freeSlots: { start: string; end: string; minutes: number }[];
  unscheduled: { id: string; title: string; priority: "HIGH" | "MEDIUM" | "LOW"; status: string; dueDate: string | null; overdue: boolean; goal: string | null }[];
  focus: string | null;
}

/* ---------------- Insights ---------------- */

export interface InsightTask {
  id: string;
  title: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: string;
  dueDate: string | null;
  overdue: boolean;
  focusRank: number | null;
}

export interface Insights {
  generatedAt: string;
  priorities: InsightTask[];
  overdue: { count: number; items: InsightTask[] };
  reminders: { id: string; title: string; kind: string; at: string }[];
  stats: {
    completedThisWeek: number;
    completedLastWeek: number;
    dueThisWeek: number;
    completionRate: number; // 0..100 of tasks due this week
    habitRate: number | null; // 0..100
    activeGoals: number;
    avgGoalProgress: number | null;
    eventsToday: number;
  };
  lines: { tone: "positive" | "neutral" | "warning"; text: string }[];
}
