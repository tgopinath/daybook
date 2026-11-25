"use client";
import { useEffect, useState } from "react";
import type { KeyedMutator } from "swr";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import { DEFAULT_LAYOUT, widgetMeta, type WidgetPref } from "./widgets";

function Row({ pref, onToggle }: { pref: WidgetPref; onToggle: (v: boolean) => void }) {
  const meta = widgetMeta(pref.id)!;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pref.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-[12px] border border-line bg-surface px-2 py-2.5", isDragging && "relative z-10 shadow-pop")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${meta.label}`}
        className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13.5px] font-medium", pref.visible ? "text-fg" : "text-fg-2")}>{meta.label}</div>
        <div className="truncate text-[12px] text-fg-3">{meta.description}</div>
      </div>
      <Switch checked={pref.visible} onChange={onToggle} label={`Show ${meta.label}`} />
    </li>
  );
}

export function CustomizeDialog({ open, onOpenChange, data, mutate }: { open: boolean; onOpenChange: (o: boolean) => void; data: DashboardData; mutate: KeyedMutator<DashboardData> }) {
  const [items, setItems] = useState<WidgetPref[]>(data.layout);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setItems(data.layout);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((list) => arrayMove(list, list.findIndex((w) => w.id === active.id), list.findIndex((w) => w.id === over.id)));
  }

  async function persist(body: { widgets: WidgetPref[] } | { reset: true }, message: string) {
    setSaving(true);
    const prev = data;
    const layout = "reset" in body ? DEFAULT_LAYOUT.map((w) => ({ ...w })) : body.widgets;
    await mutate({ ...data, layout }, { revalidate: false });
    try {
      const res = await api.put<{ layout: WidgetPref[] }>("/api/dashboard/layout", body);
      await mutate({ ...data, layout: res.layout }, { revalidate: false });
      toast.success(message);
      onOpenChange(false);
    } catch (err) {
      await mutate(prev, { revalidate: false });
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  const visibleCount = items.filter((w) => w.visible).length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Customise your overview"
      description="Drag to reorder, switch off what you don't need."
      size="md"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" disabled={saving} onClick={() => void persist({ reset: true }, "Overview reset to default")}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void persist({ widgets: items }, "Overview layout saved")}>
            Save
          </Button>
        </>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {items.map((w) => (
              <Row key={w.id} pref={w} onToggle={(v) => setItems((list) => list.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="mt-3 text-[12px] text-fg-3">
        {visibleCount} of {items.length} widgets shown. Half-width widgets sit side by side on wide screens.
      </p>
    </Dialog>
  );
}
