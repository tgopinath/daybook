import type { WireTask, Priority } from "@/components/tasks/types";

export type SmartList = "all" | "today" | "upcoming" | "overdue" | "completed";
export type ViewMode = "list" | "board" | "calendar" | "priority";
export type SortKey = "manual" | "due" | "priority" | "category" | "created";
export type Filters = { priority: Priority | ""; categoryId: string; projectId: string; tag: string };
export const EMPTY_FILTERS: Filters = { priority: "", categoryId: "", projectId: "", tag: "" };

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual",
  due: "Due date",
  priority: "Priority",
  category: "Category",
  created: "Newest first",
};

const PRANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const dueMs = (t: WireTask) => (t.dueDate ? Date.parse(t.dueDate) : Number.POSITIVE_INFINITY);

export function sortTasks(items: WireTask[], sort: SortKey): WireTask[] {
  const arr = [...items];
  const manual = (a: WireTask, b: WireTask) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
  switch (sort) {
    case "due":
      return arr.sort((a, b) => dueMs(a) - dueMs(b) || PRANK[a.priority] - PRANK[b.priority] || manual(a, b));
    case "priority":
      return arr.sort((a, b) => PRANK[a.priority] - PRANK[b.priority] || dueMs(a) - dueMs(b) || manual(a, b));
    case "category":
      return arr.sort((a, b) => {
        const an = a.category?.name, bn = b.category?.name;
        if (an !== bn) return !an ? 1 : !bn ? -1 : an.localeCompare(bn);
        return manual(a, b);
      });
    case "created":
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    default:
      return arr.sort(manual);
  }
}

export function buildQuery(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  return sp.toString();
}
