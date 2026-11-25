"use client";
import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PRIORITY_META, Skeleton } from "@/components/ui/misc";
import { TaskRow } from "@/components/tasks/task-row";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { updateTask } from "@/components/tasks/actions";
import { moveToDay, fmtDayKey } from "@/components/tasks/utils";
import { isDone, type TaskList, type WireTask } from "@/components/tasks/types";
import { useApi } from "@/lib/client";
import { addDaysKey, dayKey, weekdayOfKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { buildQuery } from "./shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({ tz, weekStart, params, filter }: { tz: string; weekStart: number; params: Record<string, string>; filter: (t: WireTask) => boolean }) {
  const today = dayKey(new Date(), tz);
  const [month, setMonth] = useState(today.slice(0, 7)); // yyyy-MM
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [dragging, setDragging] = useState<WireTask | null>(null);

  const days = useMemo(() => {
    const first = `${month}-01`;
    const lead = (weekdayOfKey(first) - weekStart + 7) % 7;
    const start = addDaysKey(first, -lead);
    return Array.from({ length: 42 }, (_, i) => addDaysKey(start, i));
  }, [month, weekStart]);

  const url = `/api/tasks?${buildQuery({ ...params, view: params.view === "active" ? "all" : params.view, from: days[0], to: days[41], counts: "0" })}`;
  const { data, error, isLoading } = useApi<TaskList>(url);
  const tasks = useMemo(() => (data?.items ?? []).filter(filter), [data, filter]);
  const byDay = useMemo(() => {
    const m = new Map<string, WireTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const k = dayKey(new Date(t.dueDate), tz);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    for (const list of m.values()) list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
    return m;
  }, [tasks, tz]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));

  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const t = tasks.find((x) => x.id === e.active.id);
    const day = e.over ? String(e.over.id) : null;
    if (!t || !day) return;
    if (t.dueDate && dayKey(new Date(t.dueDate), tz) === day) return;
    setSelectedDay(day);
    void updateTask(t.id, { dueDate: day }, { dueDate: moveToDay(t.dueDate, day, tz) }).catch(() => undefined);
  };

  const [y, m] = month.split("-").map(Number);
  const weekdays = Array.from({ length: 7 }, (_, i) => WD[(i + weekStart) % 7]!);
  const selectedTasks = byDay.get(selectedDay) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">
          {MONTHS[m! - 1]} {y}
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => (setMonth(today.slice(0, 7)), setSelectedDay(today))}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-center text-sm text-fg-2">Couldn't load tasks: {error.message}</Card>
      ) : (
        <DndContext sensors={sensors} onDragStart={(e) => setDragging(tasks.find((x) => x.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
              {weekdays.map((d) => (
                <div key={d} className="py-2 text-center text-[11px] font-medium tracking-wide text-fg-3 uppercase">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d, i) => (
                <DayCell
                  key={d}
                  day={d}
                  inMonth={d.startsWith(month)}
                  isToday={d === today}
                  isSelected={d === selectedDay}
                  lastCol={i % 7 === 6}
                  tasks={byDay.get(d) ?? []}
                  loading={isLoading && !data}
                  onSelect={() => setSelectedDay(d)}
                />
              ))}
            </div>
          </Card>
          <DragOverlay>{dragging ? <Chip task={dragging} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[14px] font-semibold">{fmtDayKey(selectedDay, today)}</h3>
          <span className="text-[12px] text-fg-3">{selectedDay}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => openTaskDialog({ dueDate: selectedDay })}>
            <Plus className="h-4 w-4" /> Add task
          </Button>
        </div>
        {selectedTasks.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
            {selectedTasks.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} hideDue />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <EmptyState icon={CalendarDays} title="Nothing due" description="Drag a task onto a day to reschedule it, or add one here." className="py-8" />
          </Card>
        )}
      </section>
    </div>
  );
}

function DayCell({ day, inMonth, isToday, isSelected, lastCol, tasks, loading, onSelect }: { day: string; inMonth: boolean; isToday: boolean; isSelected: boolean; lastCol: boolean; tasks: WireTask[]; loading: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const MAX = 3;
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      tabIndex={0}
      aria-label={`${day}, ${tasks.length} tasks`}
      aria-selected={isSelected}
      onClick={onSelect}
      onDoubleClick={() => openTaskDialog({ dueDate: day })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "relative min-h-[64px] border-b border-line p-1 text-left outline-none transition-colors md:min-h-[112px] md:p-1.5",
        !lastCol && "border-r",
        !inMonth && "bg-surface-2/40",
        isSelected && "bg-primary-soft/40",
        isOver && "bg-primary-soft",
        "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums",
            isToday ? "bg-primary font-semibold text-on-primary" : inMonth ? "text-fg-2" : "text-fg-3",
          )}
        >
          {Number(day.slice(8))}
        </span>
      </div>
      {loading ? (
        <Skeleton className="hidden h-4 w-full md:block" />
      ) : (
        <>
          {/* Mobile: dots */}
          <div className="flex flex-wrap gap-0.5 md:hidden">
            {tasks.slice(0, 4).map((t) => (
              <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: isDone(t) ? "var(--border-strong)" : PRIORITY_META[t.priority].color }} />
            ))}
          </div>
          {/* Desktop: draggable chips */}
          <div className="hidden flex-col gap-0.5 md:flex">
            {tasks.slice(0, MAX).map((t) => (
              <DraggableChip key={t.id} task={t} />
            ))}
            {tasks.length > MAX && <span className="px-1 text-[11px] text-fg-3">+{tasks.length - MAX} more</span>}
          </div>
        </>
      )}
    </div>
  );
}

function DraggableChip({ task }: { task: WireTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-30")}>
      <Chip task={task} />
    </div>
  );
}

function Chip({ task, overlay }: { task: WireTask; overlay?: boolean }) {
  const done = isDone(task);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openTaskDialog({ id: task.id });
      }}
      className={cn(
        "flex w-full cursor-grab items-center gap-1 truncate rounded-md px-1 py-0.5 text-left text-[11.5px] hover:bg-surface-2 active:cursor-grabbing",
        overlay && "w-[150px] border border-line bg-surface shadow-pop",
        done ? "text-fg-3 line-through" : "text-fg",
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: done ? "var(--border-strong)" : PRIORITY_META[task.priority].color }} />
      <span className="truncate">{task.title}</span>
    </button>
  );
}
