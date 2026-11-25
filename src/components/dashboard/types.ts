// Wire types for /api/dashboard, /api/dashboard/stats and /api/dashboard/insights.
// Shared by the API routes (type-only import) and the dashboard components.
import type { Mood } from "@/lib/moods";
import type { WidgetPref } from "./widgets";

export type RangeKey = "7d" | "30d" | "90d" | "12m";
export type Granularity = "day" | "week" | "month";
export type PriorityKey = "HIGH" | "MEDIUM" | "LOW";
export type TaskStatusKey = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export const RANGE_OPTIONS: { value: RangeKey; label: string; short: string }[] = [
  { value: "7d", label: "7 days", short: "7D" },
  { value: "30d", label: "30 days", short: "30D" },
  { value: "90d", label: "90 days", short: "90D" },
  { value: "12m", label: "12 months", short: "12M" },
];

export interface FocusTask {
  id: string;
  title: string;
  priority: PriorityKey;
  status: TaskStatusKey;
  dueDate: string | null;
  dueLabel: string | null; // "Today · 6:00 PM", "Overdue · Mon 16 Nov"
  overdue: boolean;
  focusRank: number | null;
  category: { name: string; color: string } | null;
  goalTitle: string | null;
}

export interface ReminderOccurrence {
  id: string;
  title: string;
  kind: string;
  at: string; // ISO
  time: string; // "4:00 PM"
  dayKey: string;
  dayLabel: string; // "Today" | "Tomorrow" | "Thu 19 Nov"
}

export type UpcomingType = "task" | "meeting" | "event" | "personal" | "reminder" | "date";

export interface UpcomingItem {
  key: string;
  id: string; // task / event / reminder id
  type: UpcomingType;
  title: string;
  at: string; // ISO (sort key)
  dayKey: string;
  time: string | null; // null = all day
  endTime: string | null;
  color: string | null;
  meta: string | null; // location, priority, "Birthday", recurrence
  priority?: PriorityKey;
}

export interface UpcomingDay {
  key: string;
  label: string;
  items: UpcomingItem[];
}

export interface DashboardData {
  today: { key: string; label: string; greeting: string; firstName: string; generatedAt: string };
  tasks: { total: number; completed: number; remaining: number; percent: number; overdue: number };
  goals: { active: number; avgProgress: number; onTrack: number; top: { id: string; title: string; progress: number; color: string } | null };
  reminders: { next24h: number; next: ReminderOccurrence | null };
  habits: { total: number; scheduled: number; completed: number; bestStreak: number; bestStreakHabit: string | null };
  calendar: { today: number; next: { id: string; title: string; time: string | null; dayKey: string; dayLabel: string } | null };
  notes: { total: number; latest: { id: string; title: string; updatedAt: string } | null };
  focus: { tasks: FocusTask[]; suggested: FocusTask[]; statement: string | null; reminders: ReminderOccurrence[] };
  upcoming: UpcomingDay[];
  /** Gentle one-liner under the greeting, from the user's own data. */
  subtitle: string | null;
  layout: WidgetPref[];
  mood: { today: { id: string; mood: Mood; intensity: number; loggedAt: string; count: number } | null; streak: number };
  journal: { todayCount: number; streak: number };
  gratitude: { today: { items: string[] } | null; streak: number };
  memories: { id: string; title: string; dateLabel: string; cover: { id: string; kind: "image" | "video" | "audio" | "document"; url: string; originalName: string | null } | null }[];
  week: { start: string; label: string; tasksDone: number; habitRate: number | null; moodAvg: number | null; moodDominant: Mood | null; journalDays: number; elapsed: number };
  /** One live stat per "My spaces" card. */
  spaces: SpacesStats;
}

export interface SpacesStats {
  diary: { entriesThisWeek: number };
  schedule: { eventsToday: number };
  finance: { spentThisMonth: number; currency: string; label: string };
  tasks: { dueToday: number; overdue: number };
  storage: { bytesUsed: number; files: number; label: string };
  security: { twoFactor: boolean };
}

export interface StatsBucket {
  key: string;
  label: string; // axis label
  fullLabel: string; // tooltip label
  completed: number;
  created: number;
  habitDone: number;
  habitScheduled: number;
  habitRate: number | null; // 0-100, null when nothing was scheduled
}

export interface GoalBar {
  id: string;
  title: string;
  color: string;
  progress: number; // 0-100
  expected: number | null; // 0-100 by elapsed time, null without target date
}

export interface StatsData {
  range: RangeKey;
  granularity: Granularity;
  buckets: StatsBucket[];
  goals: GoalBar[];
  totals: { completed: number; created: number; habitDone: number; habitScheduled: number; habitRate: number | null };
}

export interface Finding {
  id: string;
  tone: "positive" | "neutral" | "warning";
  text: string;
  href?: string;
}

export interface InsightsData {
  range: RangeKey;
  granularity: Granularity;
  days: number;
  kpis: {
    completed: number;
    prevCompleted: number;
    completionRate: number | null;
    dueInRange: number;
    avgPerDay: number;
    onTimeRate: number | null;
    onTimeBase: number;
    bestStreak: number;
    bestStreakHabit: string | null;
    goalsOnTrack: number;
    goalsWithDeadline: number;
  };
  byWeekday: { day: string; count: number }[];
  byCategory: { name: string; color: string; count: number }[];
  byPriority: { priority: PriorityKey; label: string; completed: number; open: number }[];
  trend: { key: string; label: string; fullLabel: string; created: number; completed: number }[];
  habits: { id: string; name: string; color: string; rate: number | null; streak: number; cells: { key: string; label: string; rate: number | null }[] }[];
  goals: (GoalBar & { status: "ahead" | "on-track" | "behind" | "no-deadline" })[];
  findings: Finding[];
}
