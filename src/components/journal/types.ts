import type { Media } from "@/lib/upload";

export type JournalTagRef = { id: string; name: string };

/** Shape of an item from GET /api/journal (see src/app/api/journal/_lib.ts → toListItem). */
export type JournalListItem = {
  id: string;
  title: string;
  entryDate: string;
  mood: string | null;
  isPrivate: boolean;
  isDraft: boolean;
  pinned: boolean;
  wordCount: number;
  archivedAt: string | null;
  deletedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  preview: string | null; // null for private entries
  tags: JournalTagRef[];
  mediaCount: number;
  cover: Media | null;
};

export type JournalFull = JournalListItem & {
  content: Record<string, unknown>;
  plainText: string;
  media: Media[];
};

export type JournalPage = { items: JournalListItem[]; nextCursor: string | null };

export type JournalMeta = { tags: (JournalTagRef & { count: number })[]; total: number; drafts: number; private: number };

export type CalendarDay = { date: string; count: number; mood: string | null };
