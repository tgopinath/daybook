"use client";
import { useState } from "react";
import { Plus, CornerDownLeft } from "lucide-react";
import { api } from "@/lib/client";
import { toastError } from "@/components/ui/toast";
import { refreshTasks } from "@/components/tasks/actions";
import { cn } from "@/lib/utils";

/** Inline "add a task" row: Enter creates with the current list's defaults. */
export function QuickAdd({ defaults, placeholder }: { defaults: object; placeholder: string }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await api.post("/api/tasks", { ...defaults, title: t });
      setTitle("");
      refreshTasks();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn("flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 shadow-card transition-colors focus-within:border-primary", busy && "opacity-70")}>
      <Plus className="h-4 w-4 text-fg-3" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") setTitle("");
        }}
        placeholder={placeholder}
        aria-label="Quick add task"
        maxLength={300}
        className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3"
      />
      {title && (
        <span className="hidden items-center gap-1 text-[11px] text-fg-3 sm:inline-flex">
          <CornerDownLeft className="h-3 w-3" /> to add
        </span>
      )}
    </div>
  );
}
