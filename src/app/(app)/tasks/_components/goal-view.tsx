"use client";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
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
import { CalendarClock, ChevronRight, GripVertical, Inbox, Link2, Target, Unlink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge, Card, Progress, Skeleton } from "@/components/ui/misc";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { TaskRow } from "@/components/tasks/task-row";
import { InlineTaskAdd } from "@/components/tasks/inline-add";
import { linkTaskToGoal, reorderTasks } from "@/components/tasks/actions";
import type { WireTask } from "@/components/tasks/types";
import type { GoalListItem } from "@/components/goals/types";
import { useApi } from "@/lib/client";
import { describeDaysRemaining, GOAL_STATUS_META } from "@/lib/goals";
import { cn } from "@/lib/utils";

type SelectFn = (task: WireTask, e: MouseEvent | KeyboardEvent) => void;
const NONE = "none";
const SEC = "sec:";

/** Prefer the row under the pointer, then the section under it; keyboard falls back to closest center. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const row = hits.find((c) => !String(c.id).startsWith(SEC));
    return row ? [row] : hits;
  }
  return closestCenter(args);
};

function groupOf(items: WireTask[], sectionIds: string[]) {
  const known = new Set(sectionIds);
  const out: Record<string, WireTask[]> = Object.fromEntries(sectionIds.map((id) => [id, [] as WireTask[]]));
  for (const t of items) {
    const key = t.goalId && known.has(t.goalId) ? t.goalId : NONE;
    out[key]!.push(t);
  }
  return out;
}

export function GoalView({
  open,
  done,
  sortable,
  selected,
  onSelect,
  defaults,
}: {
  open: WireTask[];
  done: WireTask[];
  sortable: boolean;
  selected: Set<string>;
  onSelect: SelectFn;
  /** Fields new tasks get so they stay in the current list (e.g. today's due date). */
  defaults: object;
}) {
  const { data, error, isLoading } = useApi<{ items: GoalListItem[] }>("/api/goals");
  const allGoals = useMemo(() => data?.items ?? [], [data]);

  // One section per active goal, plus any other goal that still has open tasks here.
  const goals = useMemo(() => {
    const withTasks = new Set(open.map((t) => t.goalId).filter(Boolean));
    return allGoals.filter((g) => g.status === "ACTIVE" || withTasks.has(g.id));
  }, [allGoals, open]);
  const activeGoals = useMemo(() => allGoals.filter((g) => g.status === "ACTIVE"), [allGoals]);
  const sectionIds = useMemo(() => [...goals.map((g) => g.id), NONE], [goals]);

  const [groups, setGroups] = useState<Record<string, WireTask[]>>(() => groupOf(open, sectionIds));
  useEffect(() => setGroups(groupOf(open, sectionIds)), [open, sectionIds]);
  const doneBy = useMemo(() => groupOf(done, sectionIds), [done, sectionIds]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overSection, setOverSection] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sectionOf = (id: string): string | null => {
    if (id.startsWith(SEC)) return id.slice(SEC.length);
    for (const [k, list] of Object.entries(groups)) if (list.some((t) => t.id === id)) return k;
    return null;
  };
  const goalRef = (id: string) => {
    const g = allGoals.find((x) => x.id === id);
    return g ? { id: g.id, title: g.title, color: g.color } : null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => setOverSection(e.over ? sectionOf(String(e.over.id)) : null);
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOverSection(null);
    if (!e.over) return;
    const id = String(e.active.id);
    const from = sectionOf(id);
    const to = sectionOf(String(e.over.id));
    if (!from || !to) return;
    const task = groups[from]!.find((t) => t.id === id)!;
    if (from === to) {
      if (!sortable || e.over.id === id || String(e.over.id).startsWith(SEC)) return;
      const list = groups[from]!;
      const next = { ...groups, [from]: arrayMove(list, list.findIndex((t) => t.id === id), list.findIndex((t) => t.id === e.over!.id)) };
      setGroups(next);
      void reorderTasks(sectionIds.flatMap((s) => next[s]!.map((t) => t.id)));
      return;
    }
    // Re-link to another goal (or unlink): move it locally, then persist goalId.
    const target = groups[to]!;
    const overIdx = target.findIndex((t) => t.id === e.over!.id);
    const moved = { ...task, goalId: to === NONE ? null : to, goal: to === NONE ? null : goalRef(to), milestoneId: null, milestone: null };
    const nextTarget = [...target];
    nextTarget.splice(overIdx >= 0 ? overIdx : nextTarget.length, 0, moved);
    setGroups({ ...groups, [from]: groups[from]!.filter((t) => t.id !== id), [to]: nextTarget });
    void linkTaskToGoal(task, to === NONE ? null : goalRef(to));
  };

  const activeTask = activeId ? Object.values(groups).flat().find((t) => t.id === activeId) : null;

  const linkMenu = (task: WireTask, linked: boolean) => {
    const items: MenuItem[] = [
      { type: "label", label: linked ? "Move to goal" : "Link to goal" },
      ...activeGoals.filter((g) => g.id !== task.goalId).map((g) => ({ label: g.title, icon: Target, onSelect: () => void linkTaskToGoal(task, { id: g.id, title: g.title, color: g.color }) })),
    ];
    if (activeGoals.filter((g) => g.id !== task.goalId).length === 0) items.push({ label: "No other active goals", disabled: true, onSelect: () => undefined });
    if (linked) items.push({ type: "separator" }, { label: "Remove from goal", icon: Unlink, onSelect: () => void linkTaskToGoal(task, null) });
    return (
      <Menu
        items={items}
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={linked ? `Move “${task.title}” to another goal` : `Link “${task.title}” to a goal`}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12px] font-medium hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              linked ? "text-fg-3 hover:text-fg" : "text-primary",
            )}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {!linked && <span className="hidden sm:inline">Link to goal</span>}
          </button>
        }
      />
    );
  };

  if (isLoading && !data) return <Skeleton className="h-[320px] rounded-[14px]" />;

  const selectionMode = selected.size > 0;
  const renderRows = (key: string) => {
    const list = groups[key] ?? [];
    return (
      <SortableContext id={key} items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <Droppable id={key} highlight={!!activeId && overSection === key && sectionOf(activeId) !== key}>
          {list.length ? (
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <SortableRow key={t.id} task={t} selected={selected.has(t.id)} selectionMode={selectionMode} onSelect={onSelect} hideGoal={key !== NONE} trailing={linkMenu(t, key !== NONE)} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[12.5px] text-fg-3">{key === NONE ? "Every open task is part of a goal. Nice." : "No open tasks yet. Add the next small step below, or drag one here."}</p>
          )}
        </Droppable>
      </SortableContext>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {error && !data && (
        <Card className="px-4 py-3 text-[13px] text-fg-2">Couldn&apos;t load your goals, so tasks are shown without them.</Card>
      )}
      {data && activeGoals.length === 0 && (
        <Card className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <Target className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1 text-[13.5px] text-fg-2">Goals give your tasks a reason. Set one and group the steps that get you there.</p>
          <Link href="/goals" className="inline-flex h-8 items-center rounded-[10px] bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:outline-none">
            Set a goal
          </Link>
        </Card>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setOverSection(null))}>
        {goals.map((g) => (
          <GoalSection key={g.id} goal={g} openCount={groups[g.id]?.length ?? 0} done={doneBy[g.id] ?? []} selected={selected} onSelect={onSelect}>
            {renderRows(g.id)}
            <div className="border-t border-line p-2">
              <InlineTaskAdd goalId={g.id} milestones={g.milestones} defaults={defaults} size="sm" label={`Add a task to ${g.title}`} />
            </div>
          </GoalSection>
        ))}
        <section aria-labelledby="sec-none">
          <header className="mb-2 flex items-center gap-2 px-1">
            <Inbox className="h-4 w-4 text-fg-3" aria-hidden />
            <h3 id="sec-none" className="text-[13.5px] font-semibold text-fg">
              Not linked to a goal
            </h3>
            <span className="text-[12px] text-fg-3 tabular-nums">{groups[NONE]?.length ?? 0}</span>
          </header>
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">{renderRows(NONE)}</div>
          <DoneList tasks={doneBy[NONE] ?? []} selected={selected} onSelect={onSelect} />
        </section>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="overflow-hidden rounded-[10px] shadow-pop ring-1 ring-line">
              <TaskRow task={activeTask} compact hideDue />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p className="px-1 text-[12px] text-fg-3">Tip: drag a task onto another goal to move it, or use the link button on each row.</p>
    </div>
  );
}

function GoalSection({
  goal,
  openCount,
  done,
  selected,
  onSelect,
  children,
}: {
  goal: GoalListItem;
  openCount: number;
  done: WireTask[];
  selected: Set<string>;
  onSelect: SelectFn;
  children: ReactNode;
}) {
  const days = describeDaysRemaining(goal.daysRemaining);
  const titleId = `sec-${goal.id}`;
  return (
    <section aria-labelledby={titleId}>
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
        <header className="flex flex-col gap-2 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: goal.color }} aria-hidden />
            <h3 id={titleId} className="min-w-0 truncate text-[14.5px] font-semibold">
              <Link href={`/goals/${goal.id}`} className="rounded hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                {goal.title}
              </Link>
            </h3>
            {goal.status !== "ACTIVE" && <Badge tone={GOAL_STATUS_META[goal.status].tone}>{GOAL_STATUS_META[goal.status].label}</Badge>}
            <span className="ml-auto shrink-0 text-[12px] text-fg-3 tabular-nums">{openCount} open</span>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={goal.progress} color={goal.color} className="flex-1" />
            <span className="w-9 shrink-0 text-right text-[12.5px] font-semibold tabular-nums">{goal.progress}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-2">
            <span className={cn("inline-flex items-center gap-1", days.tone === "danger" && "font-medium text-danger", days.tone === "warning" && "text-warning-text")}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {days.label}
            </span>
            <span className="text-fg-3">
              {goal.taskCounts.done} of {goal.taskCounts.total} {goal.taskCounts.total === 1 ? "task" : "tasks"} done
            </span>
          </div>
        </header>
        {children}
      </div>
      <DoneList tasks={done} selected={selected} onSelect={onSelect} hideGoal />
    </section>
  );
}

function DoneList({ tasks, selected, onSelect, hideGoal }: { tasks: WireTask[]; selected: Set<string>; onSelect: SelectFn; hideGoal?: boolean }) {
  const [show, setShow] = useState(false);
  if (!tasks.length) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-expanded={show}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12.5px] font-medium text-fg-2 hover:text-fg"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", show && "rotate-90")} aria-hidden />
        Done
        <span className="text-fg-3 tabular-nums">{tasks.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <ul className="mt-1 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
              {tasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} selected={selected.has(t.id)} selectionMode={selected.size > 0} onSelect={onSelect} hideGoal={hideGoal} />
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Droppable({ id, highlight, children }: { id: string; highlight: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `${SEC}${id}` });
  return (
    <div ref={setNodeRef} className={cn("min-h-11 transition-colors", highlight && "bg-primary-soft")}>
      {children}
    </div>
  );
}

function SortableRow({
  task,
  selected,
  selectionMode,
  onSelect,
  hideGoal,
  trailing,
}: {
  task: WireTask;
  selected: boolean;
  selectionMode: boolean;
  onSelect: SelectFn;
  hideGoal: boolean;
  trailing: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative", isDragging && "z-10 opacity-40")}>
      <TaskRow
        task={task}
        selected={selected}
        selectionMode={selectionMode}
        onSelect={onSelect}
        hideGoal={hideGoal}
        trailing={trailing}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Drag “${task.title}” to reorder or move to another goal`}
            className="-mx-1 hidden h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none active:cursor-grabbing sm:inline-flex"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        }
      />
    </li>
  );
}
