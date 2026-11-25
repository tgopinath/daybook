// Wire types for /api/weekly-review (shared by the route and the UI).
import type { Mood } from "@/lib/moods";

export interface WeekInfo {
  start: string; // yyyy-MM-dd, first day
  end: string; // yyyy-MM-dd, last day (inclusive)
  label: string; // "16 – 22 Nov 2026"
  isCurrent: boolean;
  isFuture: boolean;
  prev: string;
  next: string | null; // null when next week is in the future
  daysElapsed: number; // 0..7 days of this week that have started
}

export interface AttentionItem {
  id: string;
  text: string;
  href: string;
}

export interface Achievement {
  id: string;
  type: "goal" | "milestone" | "bucket";
  title: string;
  detail: string | null;
  href: string;
}

export interface WeekStats {
  tasks: {
    completed: number;
    created: number;
    top: { id: string; title: string; priority: "HIGH" | "MEDIUM" | "LOW"; completedAt: string }[];
    overdue: number; // open tasks that were due by the end of this week
  };
  goals: {
    updates: number; // progress logs in the week
    moved: { id: string; title: string; color: string; from: number; to: number; unit: string | null }[];
    milestones: { id: string; title: string; goalId: string; goalTitle: string }[];
    completed: { id: string; title: string }[];
  };
  habits: {
    rate: number | null;
    done: number;
    scheduled: number;
    perHabit: { id: string; name: string; color: string; done: number; scheduled: number; rate: number | null; days: (boolean | null)[] }[];
  };
  mood: {
    avgScore: number | null;
    avgIntensity: number | null;
    checkins: number;
    days: { key: string; label: string; mood: Mood | null; score: number | null }[];
    distribution: { mood: Mood; label: string; emoji: string; color: string; count: number }[];
  };
  journal: { entries: number; words: number; days: number; items: { id: string; title: string; date: string; isPrivate: boolean }[] };
  gratitude: { days: number };
  memories: { count: number; items: { id: string; title: string }[] };
  bucket: { completed: { id: string; title: string }[] };
  timeline: { added: number; items: { id: string; title: string }[] };
  achievements: Achievement[];
  attention: AttentionItem[];
}

export interface Reflection {
  weekStart: string;
  rating: number | null;
  wins: string;
  challenges: string;
  lessons: string;
  nextWeekFocus: string;
  updatedAt: string | null;
}

export interface WeeklyReviewResponse {
  week: WeekInfo;
  stats: WeekStats;
  reflection: Reflection | null;
}

export interface WeeklyReviewHistoryItem {
  weekStart: string;
  label: string;
  rating: number | null;
  preview: string;
  updatedAt: string;
}
