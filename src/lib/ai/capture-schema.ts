// Client-safe Zod schema for saving a Quick Capture (shared by UI and API).
import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");

export const captureRecurrenceSchema = z.object({
  kind: z.enum(["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  intervalMinutes: z.number().int().min(5).max(1440).nullish(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
});

export const captureSaveSchema = z.object({
  intent: z.enum(["task", "reminder", "event", "habit", "note"]),
  title: z.string().trim().min(1, "Title is required").max(300),
  date: day.nullish(),
  time: hhmm.nullish(),
  endTime: hhmm.nullish(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).nullish(),
  recurrence: captureRecurrenceSchema.default({ kind: "NONE" }),
  category: z.string().trim().max(60).nullish(),
  notes: z.string().max(5000).nullish(),
});

export type CaptureSave = z.infer<typeof captureSaveSchema>;
