"use client";
import { mutate as globalMutate } from "swr";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { toast, toastError } from "@/components/ui/toast";
import { browserTz, dayKey } from "@/lib/time";
import { fmtDayKey } from "./utils";
import type { Priority, TaskStatus, WireTask, TaskList } from "./types";

export const TASK_KEYS = ["/api/tasks", "/api/reminders", "/api/goals", "/api/events", "/api/calendar", ...SUMMARY_KEYS];

export function refreshTasks() {
  return refresh(...TASK_KEYS);
}

const isTaskListKey = (key: unknown) => typeof key === "string" && key.startsWith("/api/tasks");

/**
 * Patch cached task lists in place (no revalidation) so the UI responds
 * instantly; call refreshTasks() after the request settles.
 */
export function optimistic(fn: (items: WireTask[]) => WireTask[]) {
  return globalMutate(
    isTaskListKey,
    (data: unknown) => {
      const d = data as TaskList | { item: WireTask } | undefined;
      if (!d) return d;
      if ("items" in d && Array.isArray(d.items)) return { ...d, items: fn(d.items) };
      if ("item" in d && d.item) {
        const out = fn([d.item]);
        return out[0] ? { ...d, item: out[0] } : d;
      }
      return d;
    },
    { revalidate: false },
  );
}

export function patchLocal(id: string, patch: Partial<WireTask>) {
  return optimistic((items) => items.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

function announceNext(next: { dueDate: string | null } | null | undefined) {
  if (!next) return;
  const tz = browserTz();
  const when = next.dueDate ? fmtDayKey(dayKey(new Date(next.dueDate), tz), dayKey(new Date(), tz)).toLowerCase() : "soon";
  toast.success(`Nice! Next occurrence scheduled for ${when}`);
}

type PatchResult = { item: WireTask; next: WireTask | null };

export async function updateTask(id: string, patch: Record<string, unknown>, local?: Partial<WireTask>) {
  if (local) patchLocal(id, local);
  try {
    const res = await api.patch<PatchResult>(`/api/tasks/${id}`, patch);
    announceNext(res.next);
    return res;
  } catch (err) {
    toastError(err);
    throw err;
  } finally {
    refreshTasks();
  }
}

export async function setStatus(task: Pick<WireTask, "id">, status: TaskStatus) {
  const local: Partial<WireTask> = { status, completedAt: status === "COMPLETED" ? new Date().toISOString() : null };
  return updateTask(task.id, { status }, local).catch(() => null);
}

export function toggleComplete(task: Pick<WireTask, "id" | "status">) {
  return setStatus(task, task.status === "COMPLETED" ? "NOT_STARTED" : "COMPLETED");
}

export async function deleteTask(task: Pick<WireTask, "id" | "title">) {
  optimistic((items) => items.filter((t) => t.id !== task.id));
  try {
    await api.delete(`/api/tasks/${task.id}`);
    toast.undo(`Deleted “${truncate(task.title)}”`, async () => {
      try {
        await api.patch(`/api/tasks/${task.id}`, { deletedAt: null });
      } catch (err) {
        toastError(err);
      } finally {
        refreshTasks();
      }
    });
  } catch (err) {
    toastError(err);
  } finally {
    refreshTasks();
  }
}

export async function archiveTask(task: Pick<WireTask, "id" | "title">) {
  optimistic((items) => items.filter((t) => t.id !== task.id));
  try {
    await api.patch(`/api/tasks/${task.id}`, { archived: true });
    toast.undo(`Archived “${truncate(task.title)}”`, async () => {
      await api.patch(`/api/tasks/${task.id}`, { archived: false }).catch(toastError);
      refreshTasks();
    });
  } catch (err) {
    toastError(err);
  } finally {
    refreshTasks();
  }
}

export async function duplicateTask(task: Pick<WireTask, "id">) {
  try {
    const res = await api.post<{ item: WireTask }>(`/api/tasks/${task.id}/duplicate`);
    toast.success("Task duplicated");
    return res.item;
  } catch (err) {
    toastError(err);
  } finally {
    refreshTasks();
  }
}

export type BulkAction =
  | "complete"
  | "uncomplete"
  | "status"
  | "priority"
  | "category"
  | "project"
  | "archive"
  | "unarchive"
  | "delete"
  | "restore"
  | "permanent";

export async function bulkTasks(ids: string[], action: BulkAction, value?: string | null) {
  if (!ids.length) return;
  const set = new Set(ids);
  if (action === "archive" || action === "delete") optimistic((items) => items.filter((t) => !set.has(t.id)));
  if (action === "priority" && value) optimistic((items) => items.map((t) => (set.has(t.id) ? { ...t, priority: value as Priority } : t)));
  if (action === "complete")
    optimistic((items) => items.map((t) => (set.has(t.id) ? { ...t, status: "COMPLETED", completedAt: new Date().toISOString() } : t)));
  try {
    const res = await api.post<{ ok: true; count: number; created: number }>("/api/tasks/bulk", { ids, action, value });
    const n = res.count;
    const noun = n === 1 ? "task" : "tasks";
    if (action === "delete")
      toast.undo(`Deleted ${n} ${noun}`, () => bulkTasks(ids, "restore").catch(() => undefined));
    else if (action === "archive")
      toast.undo(`Archived ${n} ${noun}`, () => bulkTasks(ids, "unarchive").catch(() => undefined));
    else if (action === "complete")
      toast.success(`Completed ${n} ${noun}${res.created ? ` · ${res.created} recurring scheduled` : ""}`);
    else if (action === "restore" || action === "unarchive") toast.success(`Restored ${n} ${noun}`);
    else toast.success(`Updated ${n} ${noun}`);
    return res;
  } catch (err) {
    toastError(err);
  } finally {
    refreshTasks();
  }
}

/** Persist a new manual order (and optionally a kanban status move). */
export async function reorderTasks(order: string[], move?: { id: string; status: TaskStatus }) {
  const rank = new Map(order.map((id, i) => [id, i]));
  optimistic((items) =>
    items.map((t) => {
      const r = rank.get(t.id);
      let next = r === undefined ? t : { ...t, sortOrder: r };
      if (move && t.id === move.id)
        next = { ...next, status: move.status, completedAt: move.status === "COMPLETED" ? new Date().toISOString() : null };
      return next;
    }),
  );
  try {
    const res = await api.post<{ ok: true; next: { id: string; dueDate: string | null } | null }>("/api/tasks/reorder", { order, move });
    announceNext(res.next);
  } catch (err) {
    toastError(err);
  } finally {
    refreshTasks();
  }
}

function truncate(s: string, n = 40) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
