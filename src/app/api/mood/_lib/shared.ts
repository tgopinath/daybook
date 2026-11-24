import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { MOOD_VALUES } from "@/lib/moods";
import { cleanFactors } from "@/lib/mood";
import type { MoodEntryDTO } from "@/components/mood/types";

export const DAY_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");

export const moodInput = z.object({
  mood: z.enum(MOOD_VALUES),
  intensity: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(2000).nullish(),
  factors: z.array(z.string().max(40)).max(20).optional().transform((f) => (f ? cleanFactors(f) : undefined)),
  date: DAY_KEY.optional(),
  journalEntryId: z.string().min(1).nullish(),
});

export const moodSelect = {
  id: true,
  date: true,
  mood: true,
  intensity: true,
  note: true,
  factors: true,
  loggedAt: true,
  isDemo: true,
  journalEntry: { select: { id: true, title: true, deletedAt: true } },
} satisfies Prisma.MoodEntrySelect;

type Row = Prisma.MoodEntryGetPayload<{ select: typeof moodSelect }>;

export function serializeMood(r: Row): MoodEntryDTO {
  const j = r.journalEntry && !r.journalEntry.deletedAt ? { id: r.journalEntry.id, title: r.journalEntry.title } : null;
  return {
    id: r.id,
    date: r.date,
    mood: r.mood as MoodEntryDTO["mood"],
    intensity: r.intensity,
    note: r.note,
    factors: r.factors,
    loggedAt: r.loggedAt.toISOString(),
    isDemo: r.isDemo,
    journalEntry: j,
  };
}
