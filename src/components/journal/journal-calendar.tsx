"use client";
import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApi } from "@/lib/client";
import { addDaysKey, weekdayOfKey } from "@/lib/time";
import { moodMeta } from "@/lib/moods";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { CalendarDay } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Month grid; days with entries get a dot coloured by that day's mood. */
export function JournalCalendar({ month, onMonth, selected, onSelect, today }: { month: string; onMonth: (m: string) => void; selected: string | null; onSelect: (d: string) => void; today: string }) {
  const { data, isLoading } = useApi<{ days: CalendarDay[] }>(`/api/journal/calendar?month=${month}`);
  const { data: me } = useMe();
  const weekStart = me?.settings.weekStart ?? 1;
  const byDay = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const lead = (weekdayOfKey(first) - weekStart + 7) % 7;
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = first; d.startsWith(month); d = addDaysKey(d, 1)) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [month, weekStart]);

  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + weekStart) % 7]!);
  const count = data?.days.reduce((n, d) => n + d.count, 0) ?? 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <h2 className="font-display flex-1 text-[17px] font-semibold">{monthLabel(month)}</h2>
        <Button variant="ghost" size="icon-sm" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onMonth(today.slice(0, 7))} disabled={month === today.slice(0, 7)}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Journal entries in ${monthLabel(month)}`}>
        {heads.map((h) => (
          <div key={h} className="py-1 text-[11.5px] font-medium text-fg-3" role="columnheader">
            {h}
          </div>
        ))}
        {isLoading && !data
          ? Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)
          : cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const info = byDay.get(d);
              const mood = moodMeta(info?.mood);
              const isSel = selected === d;
              const isToday = today === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  aria-selected={isSel}
                  onClick={() => onSelect(d)}
                  aria-label={`${d}${info ? `, ${info.count} ${info.count === 1 ? "entry" : "entries"}${mood ? `, ${mood.label}` : ""}` : ", no entries"}`}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-[10px] text-[13px] tabular-nums transition-colors",
                    isSel ? "bg-primary text-on-primary" : "hover:bg-surface-2",
                    !isSel && isToday && "font-semibold text-primary ring-1 ring-primary",
                    !isSel && !isToday && (info ? "text-fg" : "text-fg-2"),
                  )}
                >
                  {Number(d.slice(8))}
                  {info && (
                    <span
                      aria-hidden
                      className={cn("absolute bottom-1.5 h-1.5 w-1.5 rounded-full", isSel && "ring-1 ring-on-primary")}
                      style={{ background: mood?.color ?? "var(--primary)" }}
                    />
                  )}
                </button>
              );
            })}
      </div>
      <p className="mt-2 text-[12px] text-fg-3">{count ? `${count} ${count === 1 ? "entry" : "entries"} this month` : "No entries this month yet"}</p>
    </div>
  );
}
