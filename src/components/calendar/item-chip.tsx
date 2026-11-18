"use client";
import type { ReactNode } from "react";
import { Bell, Cake, Repeat, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/input";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { cn } from "@/lib/utils";
import { openEventDialog } from "./event-dialog";
import { toggleTask } from "./actions";
import type { CalItem } from "./types";
import { formatTime, tint } from "./utils";

/** Open the right editor for an item. */
export function openItem(item: CalItem, navigate: (href: string) => void) {
  if (item.type === "event") openEventDialog({ id: item.event.id });
  else if (item.type === "task") openTaskDialog({ id: item.task.id });
  else navigate("/reminders");
}

export function KindIcon({ item, className }: { item: CalItem; className?: string }) {
  if (item.type === "reminder") return <Bell className={className} />;
  if (item.type === "event" && item.event.kind === "birthday") return <Cake className={className} />;
  if (item.type === "event" && item.event.kind === "important") return <Star className={className} />;
  return null;
}

export function isDone(item: CalItem) {
  return item.type === "task" && (item.task.status === "COMPLETED" || item.task.status === "CANCELLED");
}

/** Compact one-line chip used in the all-day lane, month cells and "+N more" popovers. */
export function ItemChip({
  item,
  tz,
  onOpen,
  showTime = true,
  dragging,
  onPointerDown,
  className,
  trailing,
}: {
  item: CalItem;
  tz: string;
  onOpen: (item: CalItem) => void;
  showTime?: boolean;
  dragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  className?: string;
  trailing?: ReactNode;
}) {
  const done = isDone(item);
  const timed = !item.allDay;
  const label = (
    <>
      {showTime && timed && <span className="shrink-0 tabular-nums text-fg-3">{formatTime(item.start, tz)}</span>}
      <span className={cn("truncate", done && "text-fg-3 line-through")}>{item.title}</span>
      {item.type === "event" && item.event.recurrence !== "NONE" && <Repeat className="h-2.5 w-2.5 shrink-0 text-fg-3" />}
      {item.type === "reminder" && item.reminder.repeatsWithinDay && <span className="shrink-0 text-fg-3">· repeats</span>}
    </>
  );

  if (item.type === "task") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item);
        }}
        onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
        className={cn("flex h-[22px] min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-1.5 text-[11.5px] hover:bg-surface-2", className)}
        style={{ borderColor: `color-mix(in srgb, ${item.color} 55%, var(--border))` }}
        title={item.title}
      >
        <Checkbox checked={done} onChange={() => void toggleTask(item.task)} size={12} color={item.color} label={done ? "Mark as not done" : "Mark as done"} />
        {label}
        {trailing}
      </div>
    );
  }

  if (item.type === "reminder") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item);
        }}
        onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
        className={cn("flex h-[22px] min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-1.5 text-[11.5px] hover:brightness-95", className)}
        style={{ background: tint(item.color, 14) }}
        title={`Reminder · ${item.title}`}
      >
        <Bell className="h-3 w-3 shrink-0" style={{ color: item.color }} />
        {showTime && <span className="shrink-0 tabular-nums text-fg-3">{formatTime(item.start, tz)}</span>}
        <span className="truncate">{item.title}</span>
        {item.reminder.repeatsWithinDay && <span className="shrink-0 text-fg-3">· repeats</span>}
        {trailing}
      </div>
    );
  }

  const solid = item.allDay;
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
      className={cn(
        "flex h-[22px] min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11.5px] font-medium select-none hover:brightness-[0.97]",
        dragging && "opacity-40",
        onPointerDown && "touch-pan-y",
        className,
      )}
      style={solid ? { background: tint(item.color, 20), boxShadow: `inset 3px 0 0 ${item.color}` } : undefined}
      title={item.title}
    >
      {!solid && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} />}
      <KindIcon item={item} className="h-3 w-3 shrink-0" />
      {label}
      {trailing}
    </div>
  );
}
