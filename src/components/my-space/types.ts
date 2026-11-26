// Wire shape of GET /api/my-space. Every section is null when it failed to load
// (the card then shows "Couldn't load" with a retry) — one broken module never blanks the page.
import type { Mood } from "@/lib/moods";
import type { MySpacePref, MySpaceWidgetId } from "./registry";

export type MediaLite = { id: string; kind: "image" | "video" | "audio" | "document"; url: string; originalName: string | null };

export interface TasksSection {
  dueToday: number;
  overdue: number;
  completedToday: number;
  items: { id: string; title: string; priority: "HIGH" | "MEDIUM" | "LOW"; recurrence: string; dueLabel: string | null; overdue: boolean }[];
}
export interface GoalsSection {
  active: number;
  avgProgress: number;
  items: { id: string; title: string; progress: number; color: string; targetLabel: string | null }[];
}
export interface CalendarSection {
  today: number;
  items: { key: string; id: string; title: string; dayLabel: string; time: string | null; color: string | null; isToday: boolean; location: string | null }[];
}
export interface RemindersSection {
  active: number;
  items: { key: string; id: string; title: string; kind: string; dayLabel: string; time: string; repeats: boolean }[];
}
export interface HabitsSection {
  scheduled: number;
  done: number;
  items: { id: string; name: string; color: string; done: boolean; count: number; target: number; streak: number }[];
}
export interface NotesSection {
  total: number;
  items: { id: string; title: string; preview: string; pinned: boolean; updatedLabel: string }[];
}
export interface JournalSection {
  todayCount: number;
  streak: number;
  total: number;
  /** Private entries never carry a title or text here. */
  latest: { id: string; title: string | null; isPrivate: boolean; dateLabel: string; mood: Mood | null; wordCount: number } | null;
}
export interface GratitudeSection {
  streak: number;
  today: { items: string[] } | null;
}
export interface MoodSection {
  streak: number;
  today: { id: string; mood: Mood; loggedAt: string; count: number } | null;
  /** Last seven days, oldest first; mood = the latest check-in that day. */
  week: { day: string; label: string; mood: Mood | null }[];
}
export interface MemoriesSection {
  total: number;
  items: { id: string; title: string; dateLabel: string; cover: MediaLite | null }[];
  onThisDay: { count: number; first: { id: string; title: string; yearsAgo: number } | null };
}
export interface BucketSection {
  total: number;
  done: number;
  percent: number;
  next: { id: string; title: string; category: string; targetLabel: string | null } | null;
}
export interface TimelineSection {
  total: number;
  latest: { id: string; title: string; dateLabel: string; category: string } | null;
}
export interface VaultSection {
  total: number;
  categories: { category: string; count: number }[];
}
export interface StorageSection {
  bytesUsed: number;
  label: string;
  files: number;
  recent: { id: string; name: string; kind: string; sizeLabel: string; updatedLabel: string }[];
}
export interface SecuritySection {
  twoFactor: boolean;
  appLock: boolean;
  appLockMinutes: number;
  backupCodesLeft: number;
  sessions: number;
}
export interface FinanceSection {
  currency: string;
  monthLabel: string;
  income: number;
  expense: number;
  net: number;
  incomeLabel: string;
  expenseLabel: string;
  netLabel: string;
  count: number;
  topCategory: { name: string; label: string } | null;
  budget: { category: string; percent: number; state: "ok" | "warn" | "over"; spentLabel: string; limitLabel: string } | null;
}

export interface MySpaceSections {
  tasks: TasksSection | null;
  goals: GoalsSection | null;
  calendar: CalendarSection | null;
  reminders: RemindersSection | null;
  habits: HabitsSection | null;
  notes: NotesSection | null;
  journal: JournalSection | null;
  gratitude: GratitudeSection | null;
  mood: MoodSection | null;
  memories: MemoriesSection | null;
  bucket: BucketSection | null;
  timeline: TimelineSection | null;
  vault: VaultSection | null;
  storage: StorageSection | null;
  security: SecuritySection | null;
  finance: FinanceSection | null;
}

export interface MySpaceData {
  today: { key: string; label: string };
  layout: MySpacePref[];
  sections: Partial<MySpaceSections>;
}

export type SectionId = MySpaceWidgetId;
