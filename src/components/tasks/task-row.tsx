"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import {
  Archive,
  CalendarDays,
  Check,
  CheckSquare2,
  Copy,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Repeat,
  Target,
  Trash2,
  Bell,
} from "lucide-react";
import { DemoBadge } from "@/components/ui/misc";
import { Menu } from "@/components/ui/menu";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import { openTaskDialog } from "./task-dialog";
import { archiveTask, deleteTask, duplicateTask, toggleComplete, updateTask } from "./actions";
import { DueMenu, PriorityFlag, PriorityMenu } from "./pickers";
import { dueInfo, fmtTime, moveToDay } from "./utils";
import { isDone, type WireTask } from "./types";

/* ------------------------------------------------------------------ */
/* Animated completion check                                           */
/* ------------------------------------------------------------------ */

export function TaskCheck({ done, onToggle, size = 18, label }: { done: boolean; onToggle: (done: boolean) => void; size?: number; label?: string }) {
  const [burst, setBurst] = useState(0);
  const [local, setLocal] = useState(done);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pending.current) setLocal(done);
  }, [done]);
  useEffect(() => () => void (pending.current && clearTimeout(pending.current)), []);

  const click = (e: MouseEvent) => {
    e.stopPropagation();
    const next = !local;
    setLocal(next);
    if (next) setBurst((b) => b + 1);
    if (pending.current) clearTimeout(pending.current);
    // Let the check animation play before the row moves / re-sorts.
    pending.current = setTimeout(
      () => {
        pending.current = null;
        onToggle(next);
      },
      next ? 380 : 0,
    );
  };

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={local}
      aria-label={label ?? (local ? "Mark as not done" : "Mark as done")}
      onClick={click}
      onKeyDown={(e) => e.stopPropagation()}
      whileTap={{ scale: 0.85 }}
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
    >
      <motion.span
        className="absolute inset-0 rounded-full border-[1.5px]"
        initial={false}
        animate={{
          backgroundColor: local ? "var(--success)" : "rgba(0,0,0,0)",
          borderColor: local ? "var(--success)" : "var(--border-strong, #c9ccd3)",
          scale: local ? [1, 1.18, 1] : 1,
        }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      />
      <svg viewBox="0 0 16 16" className="relative h-[70%] w-[70%] text-white" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M3.5 8.5l3 3 6-7" initial={false} animate={{ pathLength: local ? 1 : 0, opacity: local ? 1 : 0 }} transition={{ duration: 0.25, delay: local ? 0.06 : 0 }} />
      </svg>
      <AnimatePresence>
        {burst > 0 && local && (
          <motion.span
            key={burst}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-success"
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 2.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

/** Minimum shape TaskRow needs; full /api/tasks items satisfy it. */
export type TaskRowTask = Pick<WireTask, "id" | "title" | "status" | "priority" | "dueDate"> & Partial<Omit<WireTask, "id" | "title" | "status" | "priority" | "dueDate">>;

export type TaskRowProps = {
  task: TaskRowTask;
  /** Override completion handling (default: PATCH status + toast for recurring). */
  onToggle?: (task: TaskRowTask, done: boolean) => void;
  /** Smaller row without inline editing / menus (dashboard widgets). */
  compact?: boolean;
  /** Multi-select support (tasks page). */
  selected?: boolean;
  selectionMode?: boolean;
  onSelect?: (task: WireTask, e: MouseEvent | KeyboardEvent) => void;
  /** Slot for a drag handle rendered before the checkbox. */
  dragHandle?: ReactNode;
  hideDue?: boolean;
  className?: string;
};

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(pointer: coarse)");
    const on = () => setCoarse(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return coarse;
}

const REVEAL = 148;

export function TaskRow({ task: raw, onToggle, compact, selected, selectionMode, onSelect: onSelectRaw, dragHandle, hideDue, className }: TaskRowProps) {
  const tz = useTz();
  const task = withDefaults(raw);
  const onSelect = onSelectRaw ? (t: TaskRowTask, e: MouseEvent | KeyboardEvent) => onSelectRaw(t as WireTask, e) : undefined;
  const done = isDone(task);
  const due = dueInfo(task.dueDate, tz, done);
  const [editing, setEditing] = useState(false);
  const coarse = useCoarsePointer();
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const dragged = useRef(false);

  const toggle = (next: boolean) => {
    if (onToggle) onToggle(raw, next);
    else void toggleComplete({ id: task.id, status: next ? "NOT_STARTED" : "COMPLETED" });
  };

  const closeSwipe = () => {
    setRevealed(false);
    animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
  };

  const open = () => openTaskDialog({ id: task.id });

  const onClick = (e: MouseEvent) => {
    if (dragged.current) return;
    if (revealed) return closeSwipe();
    if (onSelect && (e.shiftKey || e.metaKey || e.ctrlKey || selectionMode)) {
      e.preventDefault();
      onSelect(task, e);
      return;
    }
    open();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      open();
    } else if (e.key === " ") {
      e.preventDefault();
      toggle(!done);
    } else if (e.key.toLowerCase() === "x" && onSelect) {
      e.preventDefault();
      onSelect(task, e);
    }
  };

  const setDue = (day: string | null) =>
    void updateTask(task.id, { dueDate: day }, { dueDate: day ? moveToDay(task.dueDate, day, tz) : null }).catch(() => undefined);

  const menu = (
    <Menu
      trigger={
        <button
          type="button"
          aria-label="Task actions"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 data-[state=open]:opacity-100",
            !coarse && "opacity-0 group-hover:opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      }
      items={[
        { label: "Edit", icon: Pencil, onSelect: open },
        { label: "Duplicate", icon: Copy, onSelect: () => void duplicateTask(task) },
        { label: "Archive", icon: Archive, onSelect: () => void archiveTask(task) },
        { type: "separator" },
        { label: "Delete", icon: Trash2, danger: true, onSelect: () => void deleteTask(task) },
      ]}
    />
  );

  const meta = (
    <div className="flex min-w-0 shrink items-center gap-1.5 text-[12px] text-fg-3">
      {task.subtaskCount > 0 && (
        <span className={cn("inline-flex items-center gap-0.5 tabular-nums", task.subtaskDone === task.subtaskCount && "text-success")} title="Subtasks">
          <CheckSquare2 className="h-3.5 w-3.5" />
          {task.subtaskDone}/{task.subtaskCount}
        </span>
      )}
      {task.attachmentCount > 0 && (
        <span className="inline-flex items-center gap-0.5 tabular-nums" title="Attachments">
          <Paperclip className="h-3.5 w-3.5" />
          {task.attachmentCount}
        </span>
      )}
      {task.recurrence !== "NONE" && <Repeat className="h-3.5 w-3.5 shrink-0" aria-label="Repeats" />}
      {task.reminderAt && !done && <Bell className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-label="Has reminder" />}
      {task.goal && !compact && (
        <span className="hidden max-w-[140px] items-center gap-1 truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2 md:inline-flex" title={`Goal: ${task.goal.title}`}>
          <Target className="h-3 w-3 shrink-0" style={{ color: task.goal.color }} />
          <span className="truncate">{task.goal.title}</span>
        </span>
      )}
      {!compact &&
        task.tags.slice(0, 2).map((t) => (
          <span key={t.id} className="hidden truncate text-[11.5px] text-fg-3 lg:inline">
            #{t.name}
          </span>
        ))}
      {task.category && !compact && (
        <span className="hidden items-center gap-1 text-[11.5px] lg:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: task.category.color }} />
          {task.category.name}
        </span>
      )}
    </div>
  );

  const dueLabel = due && (
    <span className={cn("inline-flex items-center gap-1 text-[12px] whitespace-nowrap tabular-nums", due.overdue ? "text-danger" : due.today ? "text-primary" : "text-fg-3")}>
      <CalendarDays className="h-3.5 w-3.5" />
      {due.label}
      {task.startTime && <span className="hidden sm:inline">· {fmtTime(task.startTime)}</span>}
    </span>
  );

  const row = (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={task.title}
      aria-selected={onSelect ? !!selected : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={coarse && !compact ? { x } : undefined}
      drag={coarse && !compact && !editing ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: -REVEAL, right: 0 }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={(_, info) => {
        setTimeout(() => (dragged.current = false), 50);
        if (info.offset.x < -60) {
          setRevealed(true);
          animate(x, -REVEAL, { type: "spring", stiffness: 500, damping: 40 });
        } else closeSwipe();
      }}
      className={cn(
        "relative flex h-[var(--row-h)] cursor-default items-center gap-2.5 bg-surface px-3 outline-none select-none",
        "transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
        selected && "bg-primary-soft/60 hover:bg-primary-soft/80",
        compact && "px-2",
      )}
    >
      {onSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={selected ? "Deselect task" : "Select task"}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(task, e);
          }}
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-opacity",
            selected ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface",
            !selected && !selectionMode && !coarse && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            !selected && !selectionMode && coarse && "hidden",
          )}
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
      )}
      {dragHandle}
      <TaskCheck done={task.status === "COMPLETED"} onToggle={toggle} size={compact ? 16 : 18} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <InlineTitle
            initial={task.title}
            onDone={(title) => {
              setEditing(false);
              if (title && title !== task.title) void updateTask(task.id, { title }, { title }).catch(() => undefined);
            }}
          />
        ) : (
          <span
            onClick={(e) => {
              if (compact || coarse || e.shiftKey || e.metaKey || e.ctrlKey || selectionMode) return;
              e.stopPropagation();
              setEditing(true);
            }}
            title={compact ? task.title : "Click to rename"}
            className={cn(
              "min-w-0 truncate text-[13.5px] transition-colors duration-300",
              done ? "text-fg-3 line-through decoration-fg-3/60" : "text-fg",
              !compact && !coarse && "cursor-text",
            )}
          >
            {task.title}
          </span>
        )}
        <DemoBadge show={task.isDemo} />
        {!editing && meta}
      </div>
      {!hideDue &&
        (compact ? (
          dueLabel
        ) : (
          <DueMenu
            value={due?.key ?? null}
            onChange={setDue}
            trigger={
              <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex h-7 items-center rounded-lg px-1.5 hover:bg-surface-2" aria-label="Change due date">
                {dueLabel || <CalendarDays className={cn("h-3.5 w-3.5 text-fg-3", !coarse && "opacity-0 group-hover:opacity-100")} />}
              </button>
            }
          />
        ))}
      {compact ? (
        <PriorityFlag priority={task.priority} />
      ) : (
        <PriorityMenu
          value={task.priority}
          onChange={(priority) => void updateTask(task.id, { priority }, { priority }).catch(() => undefined)}
          trigger={
            <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Change priority">
              <PriorityFlag priority={task.priority} />
            </button>
          }
        />
      )}
      {!compact && menu}
    </motion.div>
  );

  return (
    <div className={cn("group relative overflow-hidden", className)}>
      {coarse && !compact && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL }} aria-hidden={!revealed}>
          <button
            type="button"
            tabIndex={revealed ? 0 : -1}
            onClick={() => {
              closeSwipe();
              toggle(!done);
            }}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-success text-[11px] font-medium text-white"
          >
            <Check className="h-4 w-4" />
            {task.status === "COMPLETED" ? "Undo" : "Done"}
          </button>
          <button
            type="button"
            tabIndex={revealed ? 0 : -1}
            onClick={() => {
              closeSwipe();
              void deleteTask(task);
            }}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-danger text-[11px] font-medium text-white"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
      {row}
    </div>
  );
}

function withDefaults(t: TaskRowTask) {
  return {
    ...t,
    tags: t.tags ?? [],
    subtaskCount: t.subtaskCount ?? t.subtasks?.length ?? 0,
    subtaskDone: t.subtaskDone ?? t.subtasks?.filter((s) => s.done).length ?? 0,
    attachmentCount: t.attachmentCount ?? t.attachments?.length ?? 0,
    recurrence: t.recurrence ?? "NONE",
    goal: t.goal ?? null,
    category: t.category ?? null,
    reminderAt: t.reminderAt ?? null,
    startTime: t.startTime ?? null,
    isDemo: t.isDemo ?? false,
  };
}

function InlineTitle({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [v, setV] = useState(initial);
  const finished = useRef(false);
  const finish = (val: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(val);
  };
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v.trim() || null);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(v.trim() || null)}
      aria-label="Task title"
      maxLength={300}
      className="h-7 min-w-0 flex-1 rounded-md border border-primary bg-surface px-1.5 text-[13.5px] outline-none ring-3 ring-primary/15"
    />
  );
}
