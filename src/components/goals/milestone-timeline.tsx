"use client";
import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { dayKey } from "@/lib/time";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import type { WireMilestone } from "./types";

const sync = () => refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);

export function MilestoneTimeline({ goalId, milestones, color, readOnly }: { goalId: string; milestones: WireMilestone[]; color: string; readOnly?: boolean }) {
  const tz = useTz();
  const [items, setItems] = useState(milestones);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setItems(milestones), [milestones]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const today = dayKey(new Date(), tz);

  async function patch(m: WireMilestone, data: Partial<{ title: string; dueDate: string | null; done: boolean }>) {
    const prev = items;
    const local = { ...data, ...(data.dueDate ? { dueDate: `${data.dueDate}T12:00:00.000Z` } : {}) };
    setItems((all) => all.map((x) => (x.id === m.id ? { ...x, ...local, ...(data.done !== undefined ? { completedAt: data.done ? new Date().toISOString() : null } : {}) } : x)));
    try {
      await api.patch(`/api/goals/${goalId}/milestones/${m.id}`, data);
      await sync();
      if (data.done) toast.success(`Milestone reached: ${m.title}`);
    } catch (err) {
      setItems(prev);
      toastError(err);
    }
  }

  async function remove(m: WireMilestone) {
    const ok = await confirm({ title: "Delete milestone?", body: `“${m.title}” will be removed. Linked tasks stay, but lose their milestone.`, destructive: true, confirmLabel: "Delete" });
    if (!ok) return;
    const prev = items;
    setItems((all) => all.filter((x) => x.id !== m.id));
    try {
      await api.delete(`/api/goals/${goalId}/milestones/${m.id}`);
      await sync();
      toast.success("Milestone deleted");
    } catch (err) {
      setItems(prev);
      toastError(err);
    }
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/goals/${goalId}/milestones`, { title: title.trim(), dueDate: due || null });
      setTitle("");
      setDue("");
      await sync();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((m) => m.id === active.id);
    const to = items.findIndex((m) => m.id === over.id);
    const next = arrayMove(items, from, to);
    const prev = items;
    setItems(next);
    try {
      await api.put(`/api/goals/${goalId}/milestones`, { ids: next.map((m) => m.id) });
      await sync();
    } catch (err) {
      setItems(prev);
      toastError(err);
    }
  }

  return (
    <div>
      {items.length === 0 && !adding && <p className="py-2 text-sm text-fg-3">No milestones yet. Add checkpoints to track progress along the way.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <ol className="relative">
            {items.map((m, i) => (
              <MilestoneRow key={m.id} m={m} last={i === items.length - 1 && !adding} color={color} today={today} tz={tz} readOnly={readOnly} onPatch={(d) => patch(m, d)} onRemove={() => remove(m)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {!readOnly &&
        (adding ? (
          <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2 pl-7">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone title" className="min-w-0 flex-1 basis-48" maxLength={200} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} />
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-[150px]" aria-label="Due date" />
            <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
              Add
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setAdding(false)}>
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" className="mt-1 -ml-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add milestone
          </Button>
        ))}
    </div>
  );
}

function MilestoneRow({
  m,
  last,
  color,
  today,
  tz,
  readOnly,
  onPatch,
  onRemove,
}: {
  m: WireMilestone;
  last: boolean;
  color: string;
  today: string;
  tz: string;
  readOnly?: boolean;
  onPatch: (d: Partial<{ title: string; dueDate: string | null; done: boolean }>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id, disabled: readOnly });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  useEffect(() => setTitle(m.title), [m.title]);
  const dueKey = m.dueDate ? dayKey(new Date(m.dueDate), tz) : null;
  const overdue = !m.done && dueKey != null && dueKey < today;
  const fmt = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: k.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined, timeZone: "UTC" });

  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== m.title) onPatch({ title: t });
    else setTitle(m.title);
  };

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("group relative flex gap-3 pb-4", isDragging && "z-10 opacity-80")}>
      {!last && <span className="absolute top-6 bottom-0 left-[9px] w-px" style={{ background: m.done ? color : "var(--border)" }} aria-hidden />}
      <div className="relative z-[1] pt-0.5">
        <Checkbox checked={m.done} onChange={(v) => onPatch({ done: v })} color={color} size={19} label={m.done ? `Mark “${m.title}” not done` : `Complete “${m.title}”`} className="bg-surface" />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setTitle(m.title); setEditing(false); } }} className="h-8" maxLength={200} />
        ) : (
          <button type="button" disabled={readOnly} onClick={() => setEditing(true)} className={cn("block w-full text-left text-[14px] leading-snug", m.done && "text-fg-3 line-through decoration-fg-3/60")}>
            {m.title}
          </button>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
          {m.done && m.completedAt ? (
            <span className="text-success">Done {fmt(dayKey(new Date(m.completedAt), tz))}</span>
          ) : (
            <label className={cn("relative inline-flex cursor-pointer items-center gap-1 hover:text-fg-2", overdue && "font-medium text-danger hover:text-danger")}>
              <CalendarDays className="h-3 w-3" />
              {dueKey ? `${overdue ? "Overdue · " : "Due "}${fmt(dueKey)}` : readOnly ? "No date" : "Add date"}
              {!readOnly && (
                <input
                  type="date"
                  value={dueKey ?? ""}
                  onChange={(e) => onPatch({ dueDate: e.target.value || null })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Milestone due date"
                />
              )}
            </label>
          )}
          {m.done && dueKey && <span>· was due {fmt(dueKey)}</span>}
        </div>
      </div>
      {!readOnly && (
        <div className="flex items-start gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <Button size="icon-sm" variant="ghost" aria-label="Delete milestone" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <button type="button" className="flex h-7 w-6 cursor-grab touch-none items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 active:cursor-grabbing" aria-label="Drag to reorder" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}
