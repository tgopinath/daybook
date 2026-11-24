import "server-only";
import type { GratitudeEntry } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { addDaysKey } from "@/lib/time";

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a day key; gratitude can't be written for days after tomorrow (tz slack). */
export function assertDay(date: string, todayKey: string) {
  if (!DAY_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new ApiError(400, "Date must be yyyy-MM-dd");
  if (date > addDaysKey(todayKey, 1)) throw new ApiError(400, "You can't fill in a day that hasn't happened yet");
}

export function serializeGratitude(e: GratitudeEntry) {
  return { id: e.id, date: e.date, items: e.items, prompt: e.prompt, note: e.note, isDemo: e.isDemo, createdAt: e.createdAt, updatedAt: e.updatedAt };
}
