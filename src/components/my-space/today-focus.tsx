"use client";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Crosshair, GripVertical, Pencil, Pin, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Badge, Card, PRIORITY_META, Progress, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { FocusTask, TaskStatusKey } from "@/components/dashboard/types";
import type { FocusSection } from "./types";

const refreshAll = () => refresh("/api/dashboard", "/api/tasks", ...SUMMARY_KEYS);

type Patch = (fn: (f: FocusSection) => FocusSection) => void;

/** Today's Focus: top three tasks (drag to reorder), today's intention and progress. */
export function TodayFocus({ data, todayKey, patch }: { data: FocusSection; todayKey: string; patch: Patch }) {
  const focus = data.tasks;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Persist a new focus list; optimistic, reverts on failure. */
  async function saveFocus(next: FocusTask[], suggested = data.suggested) {
    const prev = data;
    const ranked = next.map((t, i) => ({ ...t, focusRank: i + 1 }));
    patch((f) => ({ ...f, tasks: ranked, suggested }));
    try {
      await api.patch("/api/dashboard/focus", { taskIds: ranked.map((t) => t.id) });
    } catch (err) {
      patch(() => prev);
      toastError(err);
      return false;
    } finally {
      refreshAll();
    }
    return true;
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = focus.findIndex((t) => t.id === active.id);
    const to = focus.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    void saveFocus(arrayMove(focus, from, to));
  }

  async function remove(task: FocusTask) {
    const before = focus;
    const ok = await saveFocus(
      focus.filter((t) => t.id !== task.id),
      data.suggested,
    );
    if (ok) toast.undo("Removed from Today's Focus", () => void saveFocus(before));
  }

  async function pin(task: FocusTask) {
    if (focus.length >= 3) return toast.info("Today's Focus holds three tasks. Remove one first.");
    await saveFocus(
      [...focus, task],
      data.suggested.filter((t) => t.id !== task.id),
    );
  }

  async function setStatus(task: FocusTask, status: TaskStatusKey, prevStatus: TaskStatusKey, withUndo: boolean) {
    const withStatus = (s: TaskStatusKey) => (f: FocusSection) => ({ ...f, tasks: f.tasks.map((t) => (t.id === task.id ? { ...t, status: s } : t)) });
    patch(withStatus(status));
    try {
      await api.patch(`/api/tasks/${task.id}`, { status });
      if (withUndo && status === "COMPLETED") {
        toast.undo(`Completed “${task.title}”`, () => void setStatus(task, prevStatus, status, false));
      }
    } catch (err) {
      patch(withStatus(prevStatus));
      toastError(err);
    } finally {
      refreshAll();
    }
  }

  const todaySummary = data.progress;
  const empty = focus.length === 0 && data.suggested.length === 0;

  return (
    <Card className="flex min-w-0 flex-col p-4 md:p-5" role="region" aria-labelledby="today-focus-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="today-focus-title" className="font-display flex items-center gap-2 text-[17px] font-semibold">
            <Crosshair className="h-4 w-4 text-primary" aria-hidden /> Today&apos;s Focus
          </h3>
          <p className="mt-0.5 text-[12.5px] text-fg-2">Your top three priorities. Drag to reorder.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => openTaskDialog({ dueDate: todayKey })}>
          <Plus className="h-3.5 w-3.5" /> Add task
        </Button>
      </div>

      <FocusStatement statement={data.statement} patch={patch} />

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-fg-2">Today&apos;s progress</span>
          <span className="text-fg-3 tabular-nums">
            {todaySummary.completed}/{todaySummary.total} tasks · {todaySummary.percent}%
          </span>
        </div>
        <Progress value={todaySummary.percent} color={todaySummary.percent === 100 ? "var(--success)" : undefined} />
      </div>

      <div className="mt-4 flex flex-col">
        {focus.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={focus.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-1.5" aria-label="Today's Focus">
                {focus.map((t, i) => (
                  <SortableFocusRow
                    key={t.id}
                    task={t}
                    rank={i + 1}
                    onToggle={(done) => void setStatus(t, done ? "COMPLETED" : "NOT_STARTED", t.status, true)}
                    onRemove={() => void remove(t)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        {data.suggested.length > 0 && (
          <div className={cn(focus.length > 0 && "mt-4")}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">
              <Sparkles className="h-3 w-3" /> Suggested
            </div>
            <ul className="flex flex-col gap-1.5">
              {data.suggested.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-line px-2.5 py-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_META[t.priority].color }} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => openTaskDialog({ id: t.id })}>
                    <div className="truncate text-[14px] text-fg-2">{t.title}</div>
                    {t.dueLabel && <div className={cn("text-[11.5px]", t.overdue ? "text-danger" : "text-fg-3")}>{t.dueLabel}</div>}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => void pin(t)} aria-label={`Pin ${t.title} to Today's Focus`}>
                    <Pin className="h-3.5 w-3.5" /> Pin
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {empty && (
          <div className="flex flex-col items-center rounded-[10px] border border-dashed border-line px-4 py-6 text-center">
            <p className="text-[13px] text-fg-2">Nothing to focus on yet</p>
            <p className="mt-0.5 text-[12px] text-fg-3">Add a task for today and pin it here.</p>
            <Button className="mt-3" size="sm" onClick={() => openTaskDialog({ dueDate: todayKey })}>
              <Plus className="h-3.5 w-3.5" /> Add task
            </Button>
          </div>
        )}
      </div>

      {data.reminders.length > 0 && (
        <div className="mt-4 border-t border-line pt-3.5">
          <div className="mb-2 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">Coming up today</div>
          <ul className="flex flex-col gap-1.5">
            {data.reminders.map((r) => (
              <li key={`${r.id}-${r.at}`} className="flex items-center gap-2.5 text-[14px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
                  <Bell className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-fg-2">{r.title}</span>
                <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{r.time}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function SortableFocusRow({ task, rank, onToggle, onRemove }: { task: FocusTask; rank: number; onToggle: (done: boolean) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const done = task.status === "COMPLETED";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group relative flex items-center gap-2 rounded-[10px] border border-line bg-surface py-2 pr-1.5 pl-1 transition-shadow",
        isDragging ? "z-10 shadow-pop ring-1 ring-primary/30" : "hover:border-line-strong",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${task.title}. Press space to pick up, arrow keys to move.`}
        className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-fg-3 group-hover:text-fg focus-visible:text-fg active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-3 shrink-0 text-center text-[12px] font-semibold text-fg-3 tabular-nums">{rank}</span>
      <Checkbox checked={done} onChange={onToggle} label={done ? `Mark ${task.title} as not done` : `Complete ${task.title}`} color="var(--success)" />
      <button className="min-w-0 flex-1 px-1 text-left" onClick={() => openTaskDialog({ id: task.id })}>
        <div className={cn("truncate text-[14px] font-medium transition-colors", done && "text-fg-3 line-through")}>{task.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-3">
          {task.dueLabel && <span className={cn(task.overdue && !done && "text-danger")}>{task.dueLabel}</span>}
          {task.category && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: task.category.color }} />
              {task.category.name}
            </span>
          )}
        </div>
      </button>
      {task.priority === "HIGH" && !done && (
        <Badge tone="danger" className="hidden sm:inline-flex">
          High
        </Badge>
      )}
      <button
        onClick={onRemove}
        aria-label={`Remove ${task.title} from focus`}
        title="Remove from focus"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 max-md:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function FocusStatement({ statement, patch }: { statement: string | null; patch: Patch }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(statement ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(statement ?? "");
  }, [statement, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const text = draft.trim();
    setEditing(false);
    if (text === (statement ?? "")) return;
    setSaving(true);
    const prev = statement;
    patch((f) => ({ ...f, statement: text || null }));
    try {
      await api.put("/api/dashboard/focus-statement", { text });
    } catch (err) {
      patch((f) => ({ ...f, statement: prev }));
      toastError(err);
    } finally {
      setSaving(false);
      refresh("/api/dashboard", ...SUMMARY_KEYS);
    }
  }

  return (
    <div className="mt-4 rounded-[12px] bg-surface-2 px-3.5 py-3">
      <div className="mb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Today&apos;s intention</div>
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.form
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              maxLength={280}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void save()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(statement ?? "");
                  setEditing(false);
                }
              }}
              placeholder="What would make today a win?"
              aria-label="Today's focus statement"
              className="w-full bg-transparent text-[15px] font-medium text-fg outline-none placeholder:text-fg-3"
            />
          </motion.form>
        ) : (
          <motion.button
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={() => setEditing(true)}
            className="group flex w-full items-center gap-2 text-left"
            aria-label={statement ? `Edit today's focus statement: ${statement}` : "Write today's focus statement"}
          >
            <span className={cn("min-w-0 flex-1 text-[15px] font-medium", statement ? "text-fg" : "text-fg-3")} aria-busy={saving || undefined}>
              {statement || "What would make today a win?"}
            </span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TodayFocusSkeleton() {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="mt-4 h-[62px] w-full rounded-[12px]" />
      <Skeleton className="mt-4 h-3 w-full" />
      <div className="mt-4 flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-[10px]" />
        ))}
      </div>
    </Card>
  );
}
