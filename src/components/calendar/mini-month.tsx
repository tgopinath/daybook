"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addMonthsKey, firstOfMonthKey, formatKey, monthGridKeys, startOfWeekKey } from "./utils";
import { addDaysKey } from "@/lib/time";

export function MiniMonth({
  value,
  todayKey,
  weekStart,
  onSelect,
  highlightWeek,
  marked,
}: {
  value: string;
  todayKey: string;
  weekStart: number;
  onSelect: (key: string) => void;
  highlightWeek?: boolean;
  marked?: Set<string>;
}) {
  const [month, setMonth] = useState(() => firstOfMonthKey(value));
  useEffect(() => setMonth(firstOfMonthKey(value)), [value]);
  const keys = monthGridKeys(month, weekStart);
  const weekA = highlightWeek ? startOfWeekKey(value, weekStart) : null;
  const weekB = weekA ? addDaysKey(weekA, 6) : null;

  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-center justify-between pl-1">
        <span className="text-[14px] font-semibold">{formatKey(month, { month: "long", year: "numeric" })}</span>
        <div className="flex">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonthsKey(month, -1))} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(addMonthsKey(month, 1))} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10.5px] font-medium text-fg-3">
        {keys.slice(0, 7).map((k) => (
          <div key={k} className="py-1">
            {formatKey(k, { weekday: "narrow" })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {keys.map((k) => {
          const inMonth = k.slice(0, 7) === month.slice(0, 7);
          const selected = k === value;
          const today = k === todayKey;
          const inWeek = weekA && weekB && k >= weekA && k <= weekB;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(k)}
              className={cn(
                "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] tabular-nums transition-colors",
                inMonth ? "text-fg" : "text-fg-3/70",
                inWeek && !selected && "bg-surface-2",
                selected ? (today ? "bg-danger font-semibold text-white" : "bg-fg font-semibold text-surface") : today ? "font-semibold text-danger" : "hover:bg-surface-2",
              )}
              aria-label={formatKey(k, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              aria-pressed={selected}
            >
              {Number(k.slice(8))}
              {marked?.has(k) && !selected && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary/70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
