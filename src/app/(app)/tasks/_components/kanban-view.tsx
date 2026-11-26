"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, CheckSquare2, Paperclip, Plus, Repeat } from "lucide-react";
import { GoalChip } from "@/components/tasks/goal-chip";
import { DemoBadge } from "@/components/ui/misc";
import { TaskCheck } from "@/components/tasks/task-row";
import { PriorityFlag } from "@/components/tasks/pickers";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { reorderTasks, setStatus } from "@/components/tasks/actions";
import { STATUS_META, STATUS_ORDER, type TaskInit, type TaskStatus, type WireTask } from "@/components/tasks/types";
import { dueInfo } from "@/components/tasks/utils";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";

type Columns = Record<TaskStatus, string[]>;

function group(items: WireTask[]): Columns {
  const cols: Columns = { NOT_STARTED: [], IN_PROGRESS: [], COMPLETED: [], CANCELLED: [] };
  for (const t of items) cols[t.status].push(t.id);
  return cols;
}

export function KanbanView({ items, newTaskInit }: { items: WireTask[]; newTaskInit: () => Partial<TaskInit> }) {
  const byId = useMemo(() => new Map(items.map((t) => [t.id, t])), [items]);
  const [cols, setCols] = useState<Columns>(() => group(items));
  const [active, setActive] = useState<string | null>(null);
  const startCol = useRef<TaskStatus | null>(null);
  useEffect(() => {
    if (!active) setCols(group(items));
  }, [items, active]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const colOf = (id: string): TaskStatus | null => {
    if ((STATUS_ORDER as string[]).includes(id)) return id as TaskStatus;
    return STATUS_ORDER.find((s) => cols[s].includes(id)) ?? null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setActive(String(e.active.id));
    startCol.current = colOf(String(e.active.id));
  };

  const onDragOver = (e: DragOverEvent) => {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const from = colOf(id);
    const to = colOf(overId);
    if (!from || !to || from === to) return;
    setCols((c) => {
      const src = c[from].filter((x) => x !== id);
      const dst = [...c[to]];
      const idx = dst.indexOf(overId);
      dst.splice(idx >= 0 ? idx : dst.length, 0, id);
      return { ...c, [from]: src, [to]: dst };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    setActive(null);
    const overId = e.over ? String(e.over.id) : null;
    const to = overId ? colOf(overId) : null;
    if (!to) return setCols(group(items));
    let column = cols[to];
    const fromIdx = column.indexOf(id);
    const overIdx = column.indexOf(overId!);
    if (fromIdx >= 0 && overIdx >= 0 && fromIdx !== overIdx) column = arrayMove(column, fromIdx, overIdx);
    setCols((c) => ({ ...c, [to]: column }));
    const moved = startCol.current !== to;
    void reorderTasks(column, moved ? { id, status: to } : undefined);
  };

  const activeTask = active ? byId.get(active) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActive(null), setCols(group(items)))}>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 scroll-thin">
        {STATUS_ORDER.map((s) => (
          <Column key={s} status={s} ids={cols[s]} byId={byId} onAdd={() => openTaskDialog({ ...newTaskInit(), status: s })} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" }}>{activeTask ? <Card task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, ids, byId, onAdd }: { status: TaskStatus; ids: string[]; byId: Map<string, WireTask>; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  return (
    <section className="flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col md:w-auto md:max-w-none" aria-label={meta.label}>
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
        <h3 className="text-[14px] font-semibold">{meta.label}</h3>
        <span className="text-[12px] text-fg-3 tabular-nums">{ids.length}</span>
        <button type="button" onClick={onAdd} aria-label={`Add task to ${meta.label}`} className="ml-auto rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg">
          <Plus className="h-4 w-4" />
        </button>
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-[120px] flex-1 flex-col gap-2 rounded-[14px] bg-surface-2/70 p-2 transition-colors", isOver && "bg-primary-soft/60")}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableCard key={id} task={t} /> : null;
          })}
        </SortableContext>
        {ids.length === 0 && <p className="py-6 text-center text-[12px] text-fg-3">Drop tasks here</p>}
      </div>
    </section>
  );
}

function SortableCard({ task }: { task: WireTask }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-40")}>
      <Card task={task} />
    </div>
  );
}

function Card({ task, overlay }: { task: WireTask; overlay?: boolean }) {
  const tz = useTz();
  const done = task.status === "COMPLETED";
  const due = dueInfo(task.dueDate, tz, done || task.status === "CANCELLED");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTaskDialog({ id: task.id })}
      onKeyDown={(e) => {
        if (e.key === "Enter") openTaskDialog({ id: task.id });
        if (e.key === " " && e.target === e.currentTarget) {
          e.preventDefault();
          void setStatus(task, done ? "NOT_STARTED" : "COMPLETED");
        }
      }}
      className={cn(
        "cursor-grab rounded-xl border border-line bg-surface p-3 text-left shadow-card outline-none transition-shadow hover:shadow-pop focus-visible:ring-2 focus-visible:ring-primary/30 active:cursor-grabbing",
        overlay && "rotate-[1.5deg] shadow-pop",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[1px]">
          <TaskCheck done={done} size={16} onToggle={(v) => void setStatus(task, v ? "COMPLETED" : "NOT_STARTED")} />
        </span>
        <p className={cn("min-w-0 flex-1 text-[14px] leading-snug", done || task.status === "CANCELLED" ? "text-fg-3 line-through" : "text-fg")}>{task.title}</p>
        <PriorityFlag priority={task.priority} className="mt-0.5 shrink-0" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-6 text-[11.5px] text-fg-3">
        {due && (
          <span className={cn("inline-flex items-center gap-1", due.overdue ? "text-danger" : due.today && "text-primary")}>
            <CalendarDays className="h-3 w-3" />
            {due.label}
          </span>
        )}
        {task.subtaskCount > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CheckSquare2 className="h-3 w-3" />
            {task.subtaskDone}/{task.subtaskCount}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {task.attachmentCount}
          </span>
        )}
        {task.recurrence !== "NONE" && <Repeat className="h-3 w-3" aria-label="Repeats" />}
        {task.goal && <GoalChip goal={task.goal} />}
        {task.category && (
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: task.category.color }} />
            {task.category.name}
          </span>
        )}
        <DemoBadge show={task.isDemo} />
      </div>
    </div>
  );
}
