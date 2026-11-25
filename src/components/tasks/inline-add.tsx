"use client";
import { useId, useState } from "react";
import { CornerDownLeft, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { refreshTasks } from "./actions";
import type { WireTask } from "./types";

type MilestoneOption = { id: string; title: string; done?: boolean };

/**
 * Inline "add a task" field tied to a goal (and optionally a milestone).
 * Enter creates the task and keeps focus so several can be added in a row.
 */
export function InlineTaskAdd({
  goalId,
  milestoneId,
  milestones,
  defaults,
  placeholder = "Add a task to this goal…",
  label,
  size = "md",
  className,
  onCreated,
}: {
  goalId: string;
  /** Fixed milestone (no picker). */
  milestoneId?: string | null;
  /** Show an optional milestone picker with these options. */
  milestones?: MilestoneOption[];
  /** Extra fields for the new task (e.g. the current list's due date). */
  defaults?: object;
  placeholder?: string;
  /** Accessible label (defaults to the placeholder). */
  label?: string;
  size?: "sm" | "md";
  className?: string;
  onCreated?: (task: WireTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [ms, setMs] = useState("");
  const [busy, setBusy] = useState(false);
  const msId = useId();
  const options = (milestones ?? []).filter((m) => !m.done);

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ item: WireTask }>("/api/tasks", {
        ...defaults,
        title: t,
        goalId,
        milestoneId: milestoneId !== undefined ? milestoneId : ms || null,
      });
      setTitle("");
      onCreated?.(res.item);
      refreshTasks();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-surface px-2.5 transition-colors focus-within:border-solid focus-within:border-primary",
        size === "sm" ? "h-9" : "h-10",
        busy && "opacity-70",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Plus className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") setTitle("");
        }}
        placeholder={placeholder}
        aria-label={label ?? placeholder.replace(/…$/, "")}
        maxLength={300}
        className={cn("h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3", size === "sm" ? "text-[13px]" : "text-[13.5px]")}
      />
      {options.length > 0 && milestoneId === undefined && (
        <>
          <label htmlFor={msId} className="sr-only">
            Milestone for the new task
          </label>
          <select
            id={msId}
            value={ms}
            onChange={(e) => setMs(e.target.value)}
            className="h-7 max-w-[38%] min-w-0 truncate rounded-md border border-line bg-surface px-1.5 text-[12px] text-fg-2 outline-none focus-visible:border-primary sm:max-w-[180px]"
          >
            <option value="">No milestone</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </>
      )}
      {title && (
        <button
          type="button"
          onClick={() => void submit()}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-primary hover:bg-primary-soft"
          aria-label="Add task"
        >
          <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Add</span>
        </button>
      )}
    </div>
  );
}
