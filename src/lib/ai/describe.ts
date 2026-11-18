// Client-safe formatting of proposed tool calls for confirmation cards.
import { TOOL_LABELS } from "./types";
import { formatHHMM } from "./slots";

const PRIORITY: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

/** "Fri 20 Nov" from "2026-11-20" (calendar date, no tz shift). */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(d);
}

/** Formats "2026-11-20T18:00" (local wall time) or an ISO instant. */
export function formatLocalDateTime(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v);
  if (!m) return v;
  // Instants with an explicit offset are shown as given (date + time portion).
  return m[2] ? `${formatDay(m[1]!)} ${formatHHMM(m[2])}` : formatDay(m[1]!);
}

function recurrenceText(input: Record<string, unknown>): string | null {
  const r = String(input.recurrence ?? "NONE");
  if (r === "NONE") return null;
  if (r === "HOURLY") {
    const m = Number(input.intervalMinutes) || 60;
    return m % 60 === 0 ? (m === 60 ? "Every hour" : `Every ${m / 60} hours`) : `Every ${m} min`;
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = Array.isArray(input.daysOfWeek) ? (input.daysOfWeek as number[]) : [];
  if (r === "WEEKLY" && days.length) return `Weekly · ${days.map((d) => names[d]).join(", ")}`;
  return r.charAt(0) + r.slice(1).toLowerCase();
}

export interface ToolCallDescription {
  label: string;
  primary: string;
  meta: string[];
  items?: { title: string; meta: string[] }[];
}

export function describeToolCall(name: string, input: Record<string, unknown>, context?: Record<string, string>): ToolCallDescription {
  const label = TOOL_LABELS[name] ?? name;
  const s = (k: string) => (typeof input[k] === "string" && input[k] ? (input[k] as string) : null);
  const meta: string[] = [];
  switch (name) {
    case "create_task":
    case "update_task": {
      const due = s("dueDate");
      if (due) meta.push(formatDay(due) + (s("endTime") ? ` ${formatHHMM(s("endTime")!)}` : s("startTime") ? ` ${formatHHMM(s("startTime")!)}` : ""));
      if (s("startTime") && s("endTime")) meta.push(`${formatHHMM(s("startTime")!)}–${formatHHMM(s("endTime")!)}`);
      if (s("priority")) meta.push(PRIORITY[s("priority")!] ?? s("priority")!);
      if (s("status")) meta.push(s("status")!.replace("_", " ").toLowerCase());
      if (s("categoryName")) meta.push(s("categoryName")!);
      const rec = recurrenceText(input);
      if (rec) meta.push(rec);
      if (name === "create_task" && context?.goalTitle) meta.push(`Goal: ${context.goalTitle}`);
      if (name === "update_task") {
        const was = context?.taskTitle;
        const primary = s("title") ? (was && was !== s("title") ? `${was} → ${s("title")}` : s("title")!) : was ?? "Existing task";
        return { label, primary, meta };
      }
      return { label, primary: s("title") ?? "Untitled task", meta };
    }
    case "complete_task":
      return { label, primary: context?.taskTitle ?? "Task", meta: [] };
    case "create_tasks_for_goal": {
      const tasks = Array.isArray(input.tasks) ? (input.tasks as Record<string, unknown>[]) : [];
      return {
        label,
        primary: context?.goalTitle ?? `${tasks.length} tasks`,
        meta: [`${tasks.length} task${tasks.length === 1 ? "" : "s"}`],
        items: tasks.map((t) => ({
          title: String(t.title ?? "Untitled"),
          meta: [typeof t.dueDate === "string" ? formatDay(t.dueDate) : null, typeof t.priority === "string" ? PRIORITY[t.priority] ?? null : null].filter(Boolean) as string[],
        })),
      };
    }
    case "create_reminder": {
      if (s("remindAt")) meta.push(formatLocalDateTime(s("remindAt")!));
      const rec = recurrenceText(input);
      if (rec) meta.push(rec);
      if (s("kind") && s("kind") !== "custom") meta.push(s("kind")!);
      return { label, primary: s("title") ?? "Reminder", meta };
    }
    case "create_event": {
      if (s("start")) meta.push(input.allDay ? formatDay(s("start")!) + " · all day" : formatLocalDateTime(s("start")!));
      if (s("end") && !input.allDay) {
        const m = /T(\d{2}:\d{2})/.exec(s("end")!);
        if (m) meta.push(`until ${formatHHMM(m[1]!)}`);
      }
      if (s("kind")) meta.push(s("kind")!);
      return { label, primary: s("title") ?? "Event", meta };
    }
    case "create_note": {
      const text = s("text") ?? "";
      return { label, primary: s("title") ?? "Note", meta: text ? [text.length > 80 ? text.slice(0, 80) + "…" : text] : [] };
    }
    default:
      return { label, primary: name, meta: [] };
  }
}
