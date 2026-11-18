"use client";
import type { KeyboardEvent, MouseEvent } from "react";
import { Card, PRIORITY_META } from "@/components/ui/misc";
import { TaskRow } from "@/components/tasks/task-row";
import { PriorityFlag } from "@/components/tasks/pickers";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { PRIORITY_ORDER, type Priority, type TaskInit, type WireTask } from "@/components/tasks/types";
import { Plus } from "lucide-react";

export function PriorityView({
  items,
  selected,
  onSelect,
  newTaskInit,
}: {
  items: WireTask[];
  selected: Set<string>;
  onSelect: (t: WireTask, e: MouseEvent | KeyboardEvent) => void;
  newTaskInit: () => Partial<TaskInit>;
}) {
  const groups = PRIORITY_ORDER.map((p) => ({ p, list: items.filter((t) => t.priority === p) }));
  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ p, list }) => (
        <section key={p} aria-label={`${PRIORITY_META[p].label} priority`}>
          <header className="mb-2 flex items-center gap-2 px-1">
            <PriorityFlag priority={p as Priority} />
            <h3 className="text-[13.5px] font-semibold">{PRIORITY_META[p].label}</h3>
            <span className="text-[12px] text-fg-3 tabular-nums">{list.length}</span>
            <button
              type="button"
              onClick={() => openTaskDialog({ ...newTaskInit(), priority: p })}
              aria-label={`Add ${PRIORITY_META[p].label.toLowerCase()} priority task`}
              className="ml-auto rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg"
            >
              <Plus className="h-4 w-4" />
            </button>
          </header>
          {list.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
              {list.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} selected={selected.has(t.id)} selectionMode={selected.size > 0} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          ) : (
            <Card className="px-4 py-3 text-[12.5px] text-fg-3">No {PRIORITY_META[p].label.toLowerCase()} priority tasks</Card>
          )}
        </section>
      ))}
    </div>
  );
}
