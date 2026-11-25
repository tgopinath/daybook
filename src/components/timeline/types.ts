import type { Media } from "@/lib/upload";

export type TimelineEventDTO = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  dateKey: string; // yyyy-MM-dd (first day of the month/year for coarser precision)
  datePrecision: "day" | "month" | "year";
  category: string;
  media: Media[];
  deletedAt: string | null;
  archivedAt: null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RelatedEntry = { id: string; kind: "memory" | "bucket"; title: string; subtitle: string | null; dateKey: string; href: string };

export type TimelineResponse = { items: TimelineEventDTO[]; related?: RelatedEntry[] };
