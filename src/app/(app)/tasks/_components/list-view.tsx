"use client";
import { useEffect, useState, type MouseEvent, type KeyboardEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxisModifier } from "./dnd-modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { TaskRow } from "@/components/tasks/task-row";
import { reorderTasks } from "@/components/tasks/actions";
import type { WireTask } from "@/components/tasks/types";
import { cn } from "@/lib/utils";

type SelectFn = (task: WireTask, e: MouseEvent | KeyboardEvent) => void;

export function ListView({
  open,
  done,
  sortable,
  selected,
  onSelect,
  doneLabel = "Completed",
  doneDefaultOpen = false,
}: {
  open: WireTask[];
  done: WireTask[];
  sortable: boolean;
  selected: Set<string>;
  onSelect: SelectFn;
  doneLabel?: string;
  doneDefaultOpen?: boolean;
}) {
  const [order, setOrder] = useState(open);
  useEffect(() => setOrder(open), [open]);
  const [showDone, setShowDone] = useState(doneDefaultOpen);
  useEffect(() => setShowDone(doneDefaultOpen), [doneDefaultOpen]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const selectionMode = selected.size > 0;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((t) => t.id === e.active.id);
    const to = order.findIndex((t) => t.id === e.over!.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    void reorderTasks(next.map((t) => t.id));
  };

  return (
    <div className="flex flex-col gap-4">
      {order.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
          {sortable ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxisModifier]}>
              <SortableContext items={order.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-line">
                  {order.map((t) => (
                    <SortableRow key={t.id} task={t} selected={selected.has(t.id)} selectionMode={selectionMode} onSelect={onSelect} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <ul className="divide-y divide-line">
              {order.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} selected={selected.has(t.id)} selectionMode={selectionMode} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {done.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="mb-2 inline-flex items-center gap-1 rounded-md px-1 text-[13px] font-medium text-fg-2 hover:text-fg"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", showDone && "rotate-90")} />
            {doneLabel}
            <span className="text-fg-3 tabular-nums">{done.length}</span>
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
                  {done.map((t) => (
                    <li key={t.id}>
                      <TaskRow task={t} selected={selected.has(t.id)} selectionMode={selectionMode} onSelect={onSelect} />
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}

function SortableRow({ task, selected, selectionMode, onSelect }: { task: WireTask; selected: boolean; selectionMode: boolean; onSelect: SelectFn }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 shadow-pop ring-1 ring-line")}
    >
      <TaskRow
        task={task}
        selected={selected}
        selectionMode={selectionMode}
        onSelect={onSelect}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to reorder"
            className="-mx-1 hidden h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 active:cursor-grabbing sm:inline-flex"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        }
      />
    </li>
  );
}
