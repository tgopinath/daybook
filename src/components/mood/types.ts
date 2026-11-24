// Wire types for /api/mood and /api/mood/stats (shared by routes and UI).
import type { Mood } from "@/lib/moods";

export type MoodRange = "7d" | "30d" | "90d" | "12m";

export const MOOD_RANGES: { value: MoodRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
];

export interface MoodEntryDTO {
  id: string;
  date: string;
  mood: Mood;
  intensity: number;
  note: string | null;
  factors: string[];
  loggedAt: string;
  isDemo: boolean;
  journalEntry: { id: string; title: string } | null;
}

export interface MoodListResponse {
  items: MoodEntryDTO[];
  nextCursor: string | null;
}

export interface MoodStats {
  range: MoodRange;
  from: string;
  to: string;
  granularity: "day" | "month";
  checkins: number;
  daysLogged: number;
  avgScore: number | null;
  avgIntensity: number | null;
  dominant: Mood | null;
  streak: { current: number; longest: number };
  series: { key: string; label: string; fullLabel: string; score: number | null; count: number; mood: Mood | null }[];
  distribution: { mood: Mood; label: string; emoji: string; color: string; count: number }[];
  topFactors: { factor: string; count: number }[];
  factorsByMood: { mood: Mood; count: number; factors: { factor: string; count: number }[] }[];
  weekdays: { weekday: number; name: string; avg: number | null; days: number }[];
  bestWeekday: { name: string; avg: number } | null;
  worstWeekday: { name: string; avg: number } | null;
  /** Factors the user has used before (for the chips), most used first. */
  knownFactors: string[];
}
