"use client";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { toast, toastError } from "@/components/ui/toast";
import { create } from "@/components/ui/store";
import type { CalEvent, CalOccurrence, CalTask } from "./types";

export const refreshCalendar = () => refresh("/api/events", "/api/calendar", "/api/tasks", "/api/reminders", ...SUMMARY_KEYS);

/** Optimistic position overrides for events being moved/resized: key = occurrenceKey. */
export const overrides = create<{ map: Record<string, { start: number; end: number }> }>({ map: {} });

function setOverride(key: string, v: { start: number; end: number } | null) {
  overrides.set((s) => {
    const map = { ...s.map };
    if (v) map[key] = v;
    else delete map[key];
    return { map };
  });
}

/**
 * Move/resize an event occurrence. Recurring events shift the whole series by the same delta.
 * newStart/newEnd are the occurrence's new instants (ms).
 */
export async function moveEvent(e: CalOccurrence, newStart: number, newEnd: number, verb = "moved") {
  const ds = newStart - Date.parse(e.occurrenceStart);
  const de = newEnd - Date.parse(e.occurrenceEnd);
  if (ds === 0 && de === 0) return;
  const prev = { start: e.start, end: e.end };
  const next = { start: new Date(Date.parse(e.start) + ds).toISOString(), end: new Date(Date.parse(e.end) + de).toISOString() };
  setOverride(e.occurrenceKey, { start: newStart, end: newEnd });
  try {
    await api.patch(`/api/events/${e.id}`, next);
    await refreshCalendar();
    toast.undo(e.recurrence !== "NONE" ? `All occurrences ${verb}` : `Event ${verb}`, async () => {
      try {
        await api.patch(`/api/events/${e.id}`, prev);
        await refreshCalendar();
      } catch (err) {
        toastError(err);
      }
    });
  } catch (err) {
    toastError(err);
  } finally {
    setOverride(e.occurrenceKey, null);
  }
}

export async function deleteEvent(e: Pick<CalEvent, "id" | "title">) {
  try {
    await api.delete(`/api/events/${e.id}`);
    await refreshCalendar();
    toast.undo(`Deleted “${e.title}”`, async () => {
      try {
        await api.patch(`/api/events/${e.id}`, { deletedAt: null });
        await refreshCalendar();
        toast.success("Event restored");
      } catch (err) {
        toastError(err);
      }
    });
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

export async function toggleTask(t: Pick<CalTask, "id" | "title" | "status">) {
  const done = t.status === "COMPLETED";
  try {
    await api.patch(`/api/tasks/${t.id}`, { status: done ? "NOT_STARTED" : "COMPLETED" });
    await refreshCalendar();
    if (!done)
      toast.undo(`Completed “${t.title}”`, async () => {
        try {
          await api.patch(`/api/tasks/${t.id}`, { status: "NOT_STARTED" });
          await refreshCalendar();
        } catch (err) {
          toastError(err);
        }
      });
  } catch (err) {
    toastError(err);
  }
}
