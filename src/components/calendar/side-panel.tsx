"use client";
import { useMemo } from "react";
import { Bell, CalendarDays, Cake, CheckCircle2, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { addDaysKey, dayKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { openEventDialog } from "./event-dialog";
import { MiniMonth } from "./mini-month";
import type { CalOccurrence, Layers } from "./types";
import { REMINDER_COLOR, diffDays, eventColor, formatKey, startOfDayMs } from "./utils";

export const LAYER_META: { key: keyof Layers; label: string; icon: typeof CalendarDays; swatch: React.ReactNode }[] = [
  { key: "events", label: "Events", icon: CalendarDays, swatch: <span className="h-3 w-3 rounded-[4px] bg-primary/25 shadow-[inset_3px_0_0_var(--primary)]" /> },
  { key: "tasks", label: "Tasks", icon: CheckCircle2, swatch: <span className="h-3 w-3 rounded-[4px] border-[1.5px] border-dashed border-fg-3" /> },
  { key: "reminders", label: "Reminders", icon: Bell, swatch: <Bell className="h-3 w-3" style={{ color: REMINDER_COLOR }} /> },
];

export function LayerToggles({ layers, onChange, compact }: { layers: Layers; onChange: (l: Layers) => void; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show layers">
        {LAYER_META.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={layers[l.key]}
            onClick={() => onChange({ ...layers, [l.key]: !layers[l.key] })}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
              layers[l.key] ? "border-line bg-surface text-fg shadow-card" : "border-dashed border-line text-fg-3 line-through",
            )}
          >
            {l.swatch}
            {l.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5" role="group" aria-label="Show layers">
      {LAYER_META.map((l) => (
        <label key={l.key} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] hover:bg-surface-2">
          <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--primary)]" checked={layers[l.key]} onChange={() => onChange({ ...layers, [l.key]: !layers[l.key] })} />
          <span className={cn("flex-1", !layers[l.key] && "text-fg-3")}>{l.label}</span>
          {l.swatch}
        </label>
      ))}
    </div>
  );
}

export function SidePanel({
  anchor,
  todayKey,
  weekStart,
  tz,
  layers,
  onLayers,
  onSelectDay,
  highlightWeek,
}: {
  anchor: string;
  todayKey: string;
  weekStart: number;
  tz: string;
  layers: Layers;
  onLayers: (l: Layers) => void;
  onSelectDay: (k: string) => void;
  highlightWeek: boolean;
}) {
  const from = new Date(startOfDayMs(todayKey, tz)).toISOString();
  const to = new Date(startOfDayMs(addDaysKey(todayKey, 60), tz)).toISOString();
  const { data, isLoading, error } = useApi<{ items: CalOccurrence[] }>(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&kinds=birthday,important`);
  const upcoming = useMemo(() => (data?.items ?? []).slice(0, 8), [data]);

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col gap-5 lg:flex">
      <Button onClick={() => openEventDialog()} className="w-full justify-center">
        <Plus className="h-4 w-4" /> New event
      </Button>

      <div className="rounded-[14px] border border-line bg-surface p-3 shadow-card">
        <MiniMonth value={anchor} todayKey={todayKey} weekStart={weekStart} onSelect={onSelectDay} highlightWeek={highlightWeek} />
      </div>

      <div className="rounded-[14px] border border-line bg-surface p-2 shadow-card">
        <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Show</div>
        <LayerToggles layers={layers} onChange={onLayers} />
      </div>

      <div className="rounded-[14px] border border-line bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Birthdays &amp; important dates</h2>
          <span className="text-[11px] text-fg-3">60 days</span>
        </div>
        {isLoading && !data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : error ? (
          <p className="text-[12px] text-fg-3">Couldn&apos;t load upcoming dates.</p>
        ) : upcoming.length === 0 ? (
          <div className="py-2 text-[12px] text-fg-3">
            Nothing coming up.{" "}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => openEventDialog({ allDay: true, kind: "birthday", start: startOfDayMs(todayKey, tz), end: startOfDayMs(addDaysKey(todayKey, 1), tz) })}>
              Add a birthday
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {upcoming.map((e) => {
              const k = dayKey(new Date(e.occurrenceStart), tz);
              const inDays = diffDays(todayKey, k);
              const Icon = e.kind === "birthday" ? Cake : Star;
              const color = eventColor(e);
              return (
                <li key={e.occurrenceKey}>
                  <button type="button" onClick={() => openEventDialog({ id: e.id })} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 16%, var(--surface))` }}>
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{e.title}</span>
                      <span className="block text-[11px] text-fg-3">{formatKey(k, { weekday: "short", month: "short", day: "numeric" })}</span>
                    </span>
                    <span className={cn("shrink-0 text-[11px] tabular-nums", inDays <= 7 ? "font-medium text-danger" : "text-fg-3")}>
                      {inDays === 0 ? "Today" : inDays === 1 ? "Tmrw" : `${inDays}d`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
