"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, CheckCircle2, ChevronRight, Flag, GripVertical, ListChecks, Plus, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow, type TaskRowTask } from "@/components/tasks/task-row";
import { InlineTaskAdd } from "@/components/tasks/inline-add";
import { completeWithUndo, reorderTasks, setStatus, updateTask } from "@/components/tasks/actions";
import type { TaskList } from "@/components/tasks/types";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { dayKey } from "@/lib/time";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import type { GoalTask, WireMilestone } from "./types";

const sync = () => refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);
const NONE = "none";
const SEC = "ms:";

type Item = TaskRowTask & { milestoneId: string | null; sortOrder?: number };

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const row = hits.find((c) => !String(c.id).startsWith(SEC));
    return row ? [row] : hits;
  }
  return closestCenter(args);
};

const isClosed = (t: Pick<Item, "status">) => t.status === "COMPLETED" || t.status === "CANCELLED";

/**
 * Tasks of a goal grouped by milestone: each milestone lists its tasks with an
 * inline "add task" field, plus an "Unassigned to a milestone" group. Drag a
 * task between groups to move it. When every task of a milestone is done we
 * suggest marking the milestone reached (never automatically).
 */
export function GoalTasks({ goalId, color, fallback, milestones, readOnly }: { goalId: string; color: string; fallback: GoalTask[]; milestones: WireMilestone[]; readOnly?: boolean }) {
  const tz = useTz();
  const { data, error, isLoading } = useApi<TaskList>(`/api/tasks?goalId=${goalId}&counts=0`, { shouldRetryOnError: false });
  const source: Item[] = useMemo(() => (data?.items && !error ? data.items : fallback).filter((t) => t.status !== "CANCELLED"), [data, error, fallback]);
  const [breakOpen, setBreakOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState<string | null>(null);

  const msIds = useMemo(() => new Set(milestones.map((m) => m.id)), [milestones]);
  const keys = useMemo(() => [...milestones.map((m) => m.id), NONE], [milestones]);
  const keyOf = (t: Item) => (t.milestoneId && msIds.has(t.milestoneId) ? t.milestoneId : NONE);

  const build = () => {
    const out: Record<string, Item[]> = Object.fromEntries(keys.map((k) => [k, [] as Item[]]));
    const open = source.filter((t) => !isClosed(t)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const t of open) out[keyOf(t)]!.push(t);
    return out;
  };
  const [groups, setGroups] = useState<Record<string, Item[]>>(build);
  useEffect(() => setGroups(build()), [source, keys]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneBy = useMemo(() => {
    const out: Record<string, Item[]> = Object.fromEntries(keys.map((k) => [k, [] as Item[]]));
    for (const t of source.filter(isClosed)) out[keyOf(t)]!.push(t);
    return out;
  }, [source, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkedMilestones = new Set(source.map((t) => t.milestoneId).filter(Boolean));
  const remaining = milestones.filter((m) => !m.done && !linkedMilestones.has(m.id));
  const doneCount = source.filter((t) => t.status === "COMPLETED").length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const groupOf = (id: string) => {
    if (id.startsWith(SEC)) return id.slice(SEC.length);
    for (const [k, list] of Object.entries(groups)) if (list.some((t) => t.id === id)) return k;
    return null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => setOver(e.over ? groupOf(String(e.over.id)) : null);
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOver(null);
    if (!e.over) return;
    const id = String(e.active.id);
    const from = groupOf(id);
    const to = groupOf(String(e.over.id));
    if (!from || !to) return;
    if (from === to) {
      if (e.over.id === id || String(e.over.id).startsWith(SEC)) return;
      const list = groups[from]!;
      const next = { ...groups, [from]: arrayMove(list, list.findIndex((t) => t.id === id), list.findIndex((t) => t.id === e.over!.id)) };
      setGroups(next);
      void reorderTasks(keys.flatMap((k) => next[k]!.map((t) => t.id)));
      return;
    }
    const task = groups[from]!.find((t) => t.id === id)!;
    const ms = to === NONE ? null : milestones.find((m) => m.id === to)!;
    const moved = { ...task, milestoneId: ms?.id ?? null };
    const target = [...groups[to]!];
    const idx = target.findIndex((t) => t.id === e.over!.id);
    target.splice(idx >= 0 ? idx : target.length, 0, moved);
    setGroups({ ...groups, [from]: groups[from]!.filter((t) => t.id !== id), [to]: target });
    void updateTask(id, { milestoneId: ms?.id ?? null }, { milestoneId: ms?.id ?? null, milestone: ms ? { id: ms.id, title: ms.title } : null })
      .then(() => toast.success(ms ? `Moved to “${ms.title}”` : "Removed from its milestone"))
      .catch(() => undefined);
  };

  const toggle = (t: TaskRowTask, done: boolean) => {
    if (done) void completeWithUndo(t);
    else void setStatus(t, "NOT_STARTED");
  };

  async function markMilestone(m: WireMilestone) {
    setMarking(m.id);
    try {
      await api.patch(`/api/goals/${goalId}/milestones/${m.id}`, { done: true });
      await sync();
      toast.success(`Milestone reached: ${m.title}`);
    } catch (err) {
      toastError(err);
    } finally {
      setMarking(null);
    }
  }

  const activeTask = activeId ? Object.values(groups).flat().find((t) => t.id === activeId) : null;
  const total = source.length;

  if (isLoading && !data) return <Skeleton className="h-[180px] rounded-[12px]" />;

  const renderGroup = (key: string) => {
    const m = key === NONE ? null : milestones.find((x) => x.id === key)!;
    const open = groups[key] ?? [];
    const done = doneBy[key] ?? [];
    const all = open.length + done.length;
    const suggest = !!m && !m.done && all > 0 && open.length === 0 && !dismissed.has(m.id) && !readOnly;
    const dk = m?.dueDate ? dayKey(new Date(m.dueDate), tz) : null;
    // Without milestones there's a single, header-less list.
    const showHeader = milestones.length > 0;
    if (!m && milestones.length > 0 && all === 0 && readOnly) return null;
    return (
      <section key={key} aria-label={m ? `Milestone: ${m.title}` : milestones.length ? "Unassigned to a milestone" : "Tasks"} className="min-w-0">
        {showHeader && (
          <header className="mb-1.5 flex min-w-0 items-center gap-2 px-0.5">
            {m ? (
              m.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Milestone reached" />
              ) : (
                <Flag className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
              )
            ) : (
              <ListChecks className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
            )}
            <h3 className={cn("min-w-0 truncate text-[13.5px] font-semibold", m?.done && "text-fg-2")}>{m ? m.title : "Unassigned to a milestone"}</h3>
            {dk && !m?.done && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-fg-3">
                <CalendarDays className="h-3 w-3" aria-hidden />
                {new Date(`${dk}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
              </span>
            )}
            {all > 0 && <span className="ml-auto shrink-0 text-[11.5px] text-fg-3 tabular-nums">{done.length}/{all} done</span>}
          </header>
        )}
        {suggest && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-success-soft px-3 py-2 text-[12.5px] text-fg" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 flex-1">All tasks for this milestone are done. Mark it as reached?</span>
            <Button size="sm" onClick={() => void markMilestone(m!)} loading={marking === m!.id}>
              Mark reached
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed((s) => new Set(s).add(m!.id))}>
              Not yet
            </Button>
          </div>
        )}
        <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
          <SortableContext id={key} items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <Drop id={key} highlight={!!activeId && over === key && groupOf(activeId) !== key}>
              {open.length > 0 ? (
                <ul className="divide-y divide-line">
                  {open.map((t) => (
                    <SortableTask key={t.id} task={t} onToggle={toggle} disabled={readOnly} />
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2.5 text-[12.5px] text-fg-3">
                  {done.length ? "Everything here is done." : m ? "No tasks for this milestone yet." : milestones.length ? "Drag tasks here to unassign them." : "No open tasks."}
                </p>
              )}
            </Drop>
          </SortableContext>
          {!readOnly && (
            <div className="border-t border-line p-1.5">
              <InlineTaskAdd
                goalId={goalId}
                milestoneId={m ? m.id : null}
                size="sm"
                placeholder={m ? "Add task to this milestone…" : milestones.length ? "Add task without a milestone…" : "Add a task to this goal…"}
                label={m ? `Add task to milestone ${m.title}` : "Add task to this goal"}
                className="border-transparent"
              />
            </div>
          )}
        </div>
        <DoneToggle tasks={done} onToggle={toggle} />
      </section>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-3">{total ? `${doneCount} of ${total} ${total === 1 ? "task" : "tasks"} done` : "Tasks you link to this goal show up here."}</p>
        <div className="flex gap-1.5">
          {remaining.length > 0 && !readOnly && (
            <Button size="sm" variant="outline" onClick={() => setBreakOpen(true)}>
              <Split className="h-3.5 w-3.5" /> Break into tasks
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={() => openTaskDialog({ goalId })}>
              <Plus className="h-3.5 w-3.5" /> New task
            </Button>
          )}
        </div>
      </div>
      {error && !data && <p className="mb-2 text-[12px] text-fg-3">Showing a saved copy; couldn&apos;t refresh tasks.</p>}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setOver(null))}>
        <div className="flex flex-col gap-4">{keys.map(renderGroup)}</div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="overflow-hidden rounded-[10px] shadow-pop ring-1 ring-line">
              <TaskRow task={activeTask} compact hideDue hideGoal />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {milestones.length > 0 && !readOnly && <p className="mt-3 text-[12px] text-fg-3">Drag a task onto another milestone to move it.</p>}
      <BreakdownDialog open={breakOpen} onOpenChange={setBreakOpen} goalId={goalId} milestones={remaining} tz={tz} />
    </div>
  );
}

function Drop({ id, highlight, children }: { id: string; highlight: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `${SEC}${id}` });
  return (
    <div ref={setNodeRef} className={cn("min-h-10 transition-colors", highlight && "bg-primary-soft")}>
      {children}
    </div>
  );
}

function SortableTask({ task, onToggle, disabled }: { task: Item; onToggle: (t: TaskRowTask, done: boolean) => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative", isDragging && "z-10 opacity-40")}>
      <TaskRow
        task={task}
        hideGoal
        onToggle={onToggle}
        dragHandle={
          disabled ? undefined : (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Drag “${task.title}” to reorder or move to another milestone`}
              className="-mx-1 hidden h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none active:cursor-grabbing sm:inline-flex"
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden />
            </button>
          )
        }
      />
    </li>
  );
}

function DoneToggle({ tasks, onToggle }: { tasks: Item[]; onToggle: (t: TaskRowTask, done: boolean) => void }) {
  const [show, setShow] = useState(false);
  if (!tasks.length) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show} className="inline-flex items-center gap-1 rounded-md px-0.5 py-0.5 text-[12px] font-medium text-fg-2 hover:text-fg">
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", show && "rotate-90")} aria-hidden />
        {tasks.length} done
      </button>
      {show && (
        <ul className="mt-1 divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
          {tasks.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} hideGoal onToggle={onToggle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BreakdownDialog({ open, onOpenChange, goalId, milestones, tz }: { open: boolean; onOpenChange: (o: boolean) => void; goalId: string; milestones: WireMilestone[]; tz: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSelected(new Set(milestones.map((m) => m.id)));
  }, [open, milestones]);

  async function run() {
    setBusy(true);
    try {
      const res = await api.post<{ created: number }>(`/api/goals/${goalId}/breakdown`, { milestoneIds: [...selected] });
      await sync();
      toast.success(res.created ? `Created ${res.created} ${res.created === 1 ? "task" : "tasks"}` : "Every selected milestone already has a task");
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Break into tasks"
      description="Creates one task per milestone, linked to this goal and due on the milestone's date."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy} disabled={selected.size === 0}>
            Create {selected.size || ""} {selected.size === 1 ? "task" : "tasks"}
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-1">
        {milestones.map((m) => {
          const on = selected.has(m.id);
          return (
            <li key={m.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={on}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                {m.dueDate && <span className="text-xs text-fg-3">{new Date(`${dayKey(new Date(m.dueDate), tz)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
