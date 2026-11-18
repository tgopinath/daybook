"use client";
import { useMemo } from "react";
import { Bell, CalendarDays, MapPin, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { DemoBadge, EmptyState, PRIORITY_META } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { addDaysKey } from "@/lib/time";
import { toggleTask } from "./actions";
import { openEventDialog } from "./event-dialog";
import { KindIcon, isDone } from "./item-chip";
import type { CalItem } from "./types";
import { KIND_META, formatKey, formatTime, formatTimeRange, itemDayKeys, sortItems, tint } from "./utils";

export function AgendaView({
  days,
  items,
  tz,
  todayKey,
  onOpen,
  onLoadMore,
  loadingMore,
}: {
  days: string[];
  items: CalItem[];
  tz: string;
  todayKey: string;
  onOpen: (item: CalItem) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  const groups = useMemo(() => {
    const set = new Set(days);
    const map = new Map<string, CalItem[]>();
    for (const it of items) for (const k of itemDayKeys(it, tz)) if (set.has(k)) (map.get(k) ?? map.set(k, []).get(k)!).push(it);
    return days.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)!.sort(sortItems) }));
  }, [items, days, tz]);

  const footer = (
    <div className="flex justify-center py-4">
      <Button variant="outline" size="sm" onClick={onLoadMore} loading={loadingMore}>
        Load 30 more days
      </Button>
    </div>
  );

  if (!groups.length) {
    return (
      <div className="rounded-[14px] border border-line bg-surface shadow-card">
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled"
          description={`No events, tasks or reminders in the next ${days.length} days.`}
          action={
            <Button onClick={() => openEventDialog()}>
              <Plus className="h-4 w-4" /> New event
            </Button>
          }
        />
        {footer}
      </div>
    );
  }

  const tomorrow = addDaysKey(todayKey, 1);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
          <header className="flex items-baseline gap-2 border-b border-line px-4 py-2.5">
            <span className={cn("text-[13px] font-semibold", g.key === todayKey && "text-danger")}>
              {g.key === todayKey ? "Today" : g.key === tomorrow ? "Tomorrow" : formatKey(g.key, { weekday: "long" })}
            </span>
            <span className="text-[12px] text-fg-3">{formatKey(g.key, { month: "long", day: "numeric", year: g.key.slice(0, 4) !== todayKey.slice(0, 4) ? "numeric" : undefined })}</span>
            <span className="ml-auto text-[11px] text-fg-3 tabular-nums">{g.items.length}</span>
          </header>
          <ul className="divide-y divide-line">
            {g.items.map((it) => (
              <AgendaRow key={it.key} item={it} tz={tz} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
      {footer}
    </div>
  );
}

function AgendaRow({ item, tz, onOpen }: { item: CalItem; tz: string; onOpen: (item: CalItem) => void }) {
  const done = isDone(item);
  const time = item.allDay ? (item.type === "task" ? "Due" : item.type === "reminder" ? formatTime(item.start, tz) : "All day") : formatTimeRange(item.start, item.end, tz);
  const meta: string[] = [];
  let isDemo = false;
  if (item.type === "event") {
    const e = item.event;
    meta.push(KIND_META[e.kind]?.label ?? "Event");
    if (e.category) meta.push(e.category.name);
    isDemo = e.isDemo;
  } else if (item.type === "task") {
    meta.push("Task", PRIORITY_META[item.task.priority].label + " priority");
    if (item.task.category) meta.push(item.task.category.name);
    isDemo = item.task.isDemo;
  } else {
    meta.push("Reminder");
    if (item.reminder.repeatsWithinDay) meta.push("repeats through the day");
    isDemo = item.reminder.isDemo;
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
        className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60"
      >
        <span className="w-[92px] shrink-0 text-[12px] text-fg-2 tabular-nums sm:w-[124px]">{time}</span>
        {item.type === "task" ? (
          <Checkbox checked={done} onChange={() => void toggleTask(item.task)} size={16} color={item.color} label={done ? "Mark as not done" : "Mark as done"} />
        ) : item.type === "reminder" ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: tint(item.color, 22) }}>
            <Bell className="h-2.5 w-2.5" style={{ color: item.color }} />
          </span>
        ) : (
          <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: item.color }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {item.type === "event" && <KindIcon item={item} className="h-3.5 w-3.5 shrink-0" />}
            <span className={cn("truncate text-[13.5px] font-medium", done && "text-fg-3 line-through")}>{item.title}</span>
            {item.type === "event" && item.event.recurrence !== "NONE" && <Repeat className="h-3 w-3 shrink-0 text-fg-3" />}
            <DemoBadge show={isDemo} />
          </div>
          <div className="flex items-center gap-1.5 truncate text-[12px] text-fg-3">
            <span className="truncate">{meta.join(" · ")}</span>
            {item.type === "event" && item.event.location && (
              <span className="inline-flex min-w-0 items-center gap-0.5">
                · <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{item.event.location}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
