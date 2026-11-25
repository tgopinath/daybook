"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDaysKey, weekdayOfKey } from "@/lib/time";
import { entryMap, isScheduled, WEEKDAY_LETTER } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { HabitIcon, tint } from "./habit-icons";
import { useCheckin } from "./use-habits";
import type { HabitItem } from "./types";

/** Month tracking grid: habits × days of the month. Tap a past day to toggle. */
export function MonthGrid({ habits, todayKey, windowDays = 140 }: { habits: HabitItem[]; todayKey: string; windowDays?: number }) {
  const checkin = useCheckin();
  const [offset, setOffset] = useState(0);
  const [ty, tm] = todayKey.split("-").map(Number);
  const first = new Date(Date.UTC(ty!, tm! - 1 + offset, 1));
  const month = first.toISOString().slice(0, 7);
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const earliest = addDaysKey(todayKey, -(windowDays - 1));
  const canBack = `${month}-01` > earliest;
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">{label}</h3>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Previous month" disabled={!canBack} onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next month" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[120px] bg-surface pr-2 text-left text-[11px] font-medium text-fg-3">Habit</th>
              {days.map((k) => (
                <th key={k} className={cn("w-[22px] text-center text-[10px] font-normal text-fg-3", k === todayKey && "font-semibold text-fg")}>
                  <div>{WEEKDAY_LETTER[weekdayOfKey(k)]}</div>
                  <div className="tabular-nums">{Number(k.slice(8))}</div>
                </th>
              ))}
              <th className="pl-2 text-right text-[11px] font-medium text-fg-3">Rate</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => {
              const map = entryMap(h.entries);
              const target = Math.max(1, h.targetPerDay);
              let done = 0;
              let scheduled = 0;
              for (const k of days) {
                if (k > todayKey || k < h.startKey || !isScheduled(h, k)) continue;
                const ok = (map.get(k) ?? 0) >= target;
                if (k === todayKey && !ok) continue;
                scheduled++;
                if (ok) done++;
              }
              return (
                <tr key={h.id}>
                  <td className="sticky left-0 z-[1] max-w-[160px] bg-surface pr-2">
                    <span className="flex items-center gap-1.5 text-[12.5px]">
                      <HabitIcon name={h.icon} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{h.name}</span>
                    </span>
                  </td>
                  {days.map((k) => {
                    const future = k > todayKey;
                    const count = map.get(k) ?? 0;
                    const ok = count >= target;
                    const sched = isScheduled(h, k);
                    const missed = !future && k !== todayKey && sched && !ok && k >= h.startKey;
                    return (
                      <td key={k} className="p-0">
                        <button
                          type="button"
                          disabled={future || k < earliest}
                          onClick={() => void checkin(h, k)}
                          title={`${k}: ${ok ? "done" : count ? `${count}/${target}` : missed ? "missed" : sched ? "—" : "not scheduled"}`}
                          aria-label={`${h.name}, ${k}, ${ok ? "done" : "not done"}`}
                          className={cn(
                            "relative flex h-[22px] w-[22px] items-center justify-center rounded-[5px] transition-colors disabled:cursor-default",
                            !ok && !count && (sched && !future ? "bg-surface-2 hover:bg-line" : "border border-dashed border-line"),
                            future && "text-fg-3",
                            k === todayKey && !ok && "ring-1 ring-fg-3/40",
                          )}
                          style={ok ? { background: h.color } : count ? { background: tint(h.color, 0.3) } : undefined}
                        >
                          {missed && !count && <span className="h-1 w-1 rounded-full bg-danger/70" />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right text-[12px] text-fg-2 tabular-nums">{scheduled ? `${Math.round((done / scheduled) * 100)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
