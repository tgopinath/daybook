"use client";
import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { PAGE_SECTIONS, mySpaceMeta, type MySpaceLayout, type MySpacePref, type SectionPrefs, type WidgetSize } from "./registry";
import { WIDGET_ICONS } from "./widget-card";

function Row({ pref, onChange }: { pref: MySpacePref; onChange: (p: MySpacePref) => void }) {
  const meta = mySpaceMeta(pref.id)!;
  const Icon = WIDGET_ICONS[pref.id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pref.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-surface px-2 py-2", isDragging && "relative z-10 shadow-pop")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${meta.label}. Press space, then arrow keys to move.`}
        className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-fg">{meta.label}</div>
        <div className="truncate text-[12px] text-fg-2">{meta.description}</div>
      </div>
      {meta.resizable && pref.visible && (
        <Segmented<WidgetSize>
          size="sm"
          value={pref.size}
          onChange={(size) => onChange({ ...pref, size })}
          options={[
            { value: "small", label: "Small" },
            { value: "large", label: "Large" },
          ]}
        />
      )}
      <Switch checked={pref.visible} onChange={(visible) => onChange({ ...pref, visible })} label={`Show ${meta.label}`} />
    </li>
  );
}

export function CustomizeMySpace({
  open,
  onOpenChange,
  layout,
  saving,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  layout: MySpaceLayout;
  saving: boolean;
  onSave: (layout: MySpaceLayout) => void;
  onReset: () => void;
}) {
  const [items, setItems] = useState(layout.widgets);
  const [sections, setSections] = useState<SectionPrefs>(layout.sections);
  useEffect(() => {
    if (open) {
      setItems(layout.widgets);
      setSections(layout.sections);
    }
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

  const shown = items.filter((w) => w.visible).length;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Customise My space"
      description="Choose the sections you want, then drag to reorder your spaces, pick a size and switch off what you don't need."
      size="md"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" disabled={saving} onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => onSave({ sections, widgets: items })}>
            Save
          </Button>
        </>
      }
    >
      <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">Sections</h3>
      <ul className="mb-5 flex flex-col gap-1.5">
        {PAGE_SECTIONS.map((sec) => (
          <li key={sec.id} className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-fg">{sec.label}</div>
              <div className="truncate text-[12px] text-fg-2">{sec.description}</div>
            </div>
            <Switch checked={sections[sec.id]} onChange={(v) => setSections((s) => ({ ...s, [sec.id]: v }))} label={`Show ${sec.label}`} />
          </li>
        ))}
      </ul>
      <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">Your spaces</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {items.map((w) => (
              <Row key={w.id} pref={w} onChange={(p) => setItems((list) => list.map((x) => (x.id === p.id ? p : x)))} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="mt-3 text-[12px] text-fg-2">
        {shown} of {items.length} widgets shown. Large widgets take two columns on wider screens.
      </p>
    </Dialog>
  );
}
