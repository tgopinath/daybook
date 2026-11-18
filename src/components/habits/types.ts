import type { Habit } from "@prisma/client";
import type { Wire } from "@/lib/client";

export type HabitItem = Wire<Habit> & {
  startKey: string;
  todayKey: string;
  todayCount: number;
  doneToday: boolean;
  scheduledToday: boolean;
  streak: number;
  bestStreak: number;
  rate30: number;
  rate7: number;
  missedYesterday: boolean;
  entries: { date: string; count: number }[];
};

export type HabitList = {
  items: HabitItem[];
  todayKey: string;
  summary: { scheduledToday: number; doneToday: number; bestCurrentStreak: number; message: string | null };
};

export type HabitDetailItem = HabitItem & { reminder: { id: string; remindAt: string; recurrence: string } | null };

export type HabitStats = {
  streak: number;
  bestStreak: number;
  rate30: number;
  rate7: number;
  todayKey: string;
  totalCompletions: number;
  totalCount: number;
  last30: { done: number; scheduled: number };
  months: { month: string; label: string; done: number; scheduled: number; rate: number }[];
  weekdays: { day: number; done: number; scheduled: number; rate: number }[];
  missedLast14: string[];
};
