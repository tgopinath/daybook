"use client";
import { useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { weekdayOfKey } from "@/lib/time";
import { openEventDialog } from "./event-dialog";
import { ItemChip } from "./item-chip";
import type { CalItem } from "./types";
import { useDayDrag } from "./use-day-drag";
import { formatKey, itemDayKeys, keyMinutesToMs, sortItems } from "./utils";

const MAX_VISIBLE = 3;

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function MonthView({
  days,
  anchor,
  items,
  tz,
  todayKey,
  workStart,
  onOpen,
  onOpenDay,
}: {
  days: string[];
  anchor: string;
  items: CalItem[];
  tz: string;
  todayKey: string;
  workStart: string;
  onOpen: (item: CalItem) => void;
  onOpenDay: (key: string) => void;
}) {
  const drag = useDayDrag(tz);
  const month = anchor.slice(0, 7);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const set = new Set(days);
    for (const it of items) for (const k of itemDayKeys(it, tz)) if (set.has(k)) (map.get(k) ?? map.set(k, []).get(k)!).push(it);
    for (const list of map.values()) list.sort(sortItems);
    return map;
  }, [items, days, tz]);

  const weeks = days.length / 7;
  const open = drag.guard(onOpen);

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line">
        {days.slice(0, 7).map((k) => (
          <div key={k} className="py-2 text-center text-[11px] font-medium tracking-wide text-fg-3 uppercase">
            <span className="sm:hidden">{formatKey(k, { weekday: "narrow" })}</span>
            <span className="hidden sm:inline">{formatKey(k, { weekday: "short" })}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((k, i) => {
          const list = byDay.get(k) ?? [];
          const inMonth = k.slice(0, 7) === month;
          const today = k === todayKey;
          const wd = weekdayOfKey(k);
          const visible = list.length > MAX_VISIBLE ? list.slice(0, MAX_VISIBLE - 1) : list;
          const hidden = list.length - visible.length;
          return (
            <div
              key={k}
              data-daykey={k}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[role=button],button")) return;
                if (window.innerWidth < 640) return onOpenDay(k); // phones: tap a day to open it
                const m = toMin(workStart);
                openEventDialog({ start: keyMinutesToMs(k, m, tz), end: keyMinutesToMs(k, m + 60, tz) });
              }}
              className={cn(
                "group relative flex min-h-[74px] min-w-0 cursor-pointer flex-col gap-0.5 border-line p-1 transition-colors sm:min-h-[118px] sm:p-1.5",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !inMonth && "bg-surface-2/50",
                (wd === 0 || wd === 6) && inMonth && "bg-surface-2/25",
                drag.overDay === k && "bg-primary-soft",
                "hover:bg-surface-2/60",
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenDay(k)}
                  aria-label={`Open ${formatKey(k, { weekday: "long", month: "long", day: "numeric" })}`}
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] font-semibold tabular-nums transition-colors",
                    today ? "bg-danger text-white" : inMonth ? "text-fg hover:bg-line" : "text-fg-3 hover:bg-line",
                  )}
                >
                  {k.endsWith("-01") && !today ? formatKey(k, { month: "short", day: "numeric" }) : Number(k.slice(8))}
                </button>
              </div>

              {/* Desktop: chips */}
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {visible.map((it) => (
                  <ItemChip
                    key={it.key}
                    item={it}
                    tz={tz}
                    onOpen={open}
                    onPointerDown={it.type === "event" ? drag.onPointerDown(it) : undefined}
                    dragging={drag.draggingKey === it.key}
                  />
                ))}
                {hidden > 0 && <MorePopover dayKey={k} items={list} hidden={hidden} tz={tz} onOpen={onOpen} />}
              </div>

              {/* Mobile: dots */}
              {list.length > 0 && (
                <button type="button" onClick={() => onOpenDay(k)} className="mt-auto flex flex-wrap items-center gap-[3px] px-0.5 pb-0.5 sm:hidden" aria-label={`${list.length} items`}>
                  {list.slice(0, 4).map((it) => (
                    <span key={it.key} className={cn("h-[6px] w-[6px] rounded-full", it.type === "task" && "border border-current bg-transparent")} style={it.type === "task" ? { color: it.color } : { background: it.color }} />
                  ))}
                  {list.length > 4 && <span className="text-[9px] leading-none text-fg-3">+{list.length - 4}</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MorePopover({ dayKey, items, hidden, tz, onOpen }: { dayKey: string; items: CalItem[]; hidden: number; tz: string; onOpen: (item: CalItem) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="h-5 rounded px-1.5 text-left text-[11px] font-medium text-fg-2 hover:bg-line hover:text-fg">
          +{hidden} more
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start" className="z-[60] w-[260px] rounded-xl border border-line bg-surface p-2 shadow-pop" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1.5 px-1 text-[12px] font-semibold">{formatKey(dayKey, { weekday: "long", month: "short", day: "numeric" })}</div>
          <div className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto scroll-thin">
            {items.map((it) => (
              <ItemChip key={it.key} item={it} tz={tz} onOpen={onOpen} />
            ))}
          </div>
          <button
            type="button"
            className="mt-1.5 w-full rounded-lg px-2 py-1 text-left text-[12px] text-primary hover:bg-primary-soft"
            onClick={() => openEventDialog({ start: keyMinutesToMs(dayKey, 9 * 60, tz), end: keyMinutesToMs(dayKey, 10 * 60, tz) })}
          >
            + Add event
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

