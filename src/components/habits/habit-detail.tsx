"use client";
import { Archive, BellRing, Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { describeSchedule, entryMap, habitMessage, isScheduled, WEEKDAY_SHORT } from "@/lib/habits";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import { HabitIcon, tint } from "./habit-icons";
import { Heatmap, HeatLegend } from "./heatmap";
import { archiveHabit, deleteHabit, useCheckin } from "./use-habits";
import type { HabitDetailItem, HabitItem, HabitStats } from "./types";

export function HabitDetail({ habit, open, onOpenChange, onEdit }: { habit: HabitItem | null; open: boolean; onOpenChange: (o: boolean) => void; onEdit: (h: HabitItem) => void }) {
  const id = habit?.id;
  const { data } = useApi<{ item: HabitDetailItem }>(open && id ? `/api/habits/${id}` : null);
  const { data: stats } = useApi<HabitStats>(open && id ? `/api/habits/${id}/stats` : null);
  const { data: me } = useMe();
  const checkin = useCheckin();
  const h: HabitItem | null = data?.item && data.item.id === id ? data.item : habit;
  if (!h) return null;
  const target = Math.max(1, h.targetPerDay);
  const map = entryMap(h.entries);
  const weekStart = me?.settings.weekStart ?? 1;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: tint(h.color, 0.13), color: h.color }}>
            <HabitIcon name={h.icon} className="h-4 w-4" />
          </span>
          {h.name}
        </span>
      }
      description={[describeSchedule(h), target > 1 ? `${target}× a day` : null].filter(Boolean).join(" · ")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); void archiveHabit(h); }}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => { onOpenChange(false); void deleteHabit(h); }}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => onEdit(h)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {h.description && <p className="text-sm whitespace-pre-line text-fg-2">{h.description}</p>}
        <p className="rounded-[10px] px-3 py-2 text-[14px]" style={{ background: tint(h.color, 0.09) }}>
          {habitMessage(h, target)}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Current streak" value={`${h.streak}`} unit={h.streak === 1 ? "day" : "days"} />
          <Tile label="Best streak" value={`${h.bestStreak}`} unit={h.bestStreak === 1 ? "day" : "days"} />
          <Tile label="Last 30 days" value={`${h.rate30}%`} unit={stats ? `${stats.last30.done}/${stats.last30.scheduled}` : undefined} />
          <Tile label="Completions" value={stats ? `${stats.totalCompletions}` : "—"} unit={stats && target > 1 ? `${stats.totalCount} total` : undefined} />
        </div>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold">Last 20 weeks</h3>
            <HeatLegend color={h.color} />
          </div>
          <Heatmap
            todayKey={h.todayKey}
            weeks={20}
            weekStart={weekStart}
            color={h.color}
            size={13}
            onSelect={(k) => void checkin(h, k)}
            cell={(k) => {
              const count = map.get(k) ?? 0;
              const scheduled = isScheduled(h, k);
              const before = k < h.startKey;
              const missed = scheduled && !before && k !== h.todayKey && count < target;
              const label = new Date(`${k}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
              return {
                value: !scheduled && count === 0 ? null : count / target,
                missed,
                title: `${label} — ${count >= target ? "done" : count > 0 ? `${count}/${target}` : missed ? "missed" : scheduled ? "not done" : "not scheduled"} (tap to toggle)`,
              };
            }}
          />
          <p className="mt-1.5 text-[11.5px] text-fg-3">Tap a day to backfill or clear it.</p>
        </section>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <section>
            <h3 className="mb-2 text-[14px] font-semibold">Monthly completion</h3>
            {!stats ? (
              <Skeleton className="h-[110px]" />
            ) : (
              <div className="flex h-[110px] items-end gap-2">
                {stats.months.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${m.done}/${m.scheduled} scheduled days`}>
                    <span className="text-[10.5px] text-fg-3 tabular-nums">{m.scheduled ? `${m.rate}%` : "—"}</span>
                    <div className="flex h-[70px] w-full items-end rounded-md bg-surface-2">
                      <div className="w-full rounded-md transition-[height] duration-500" style={{ height: `${m.rate}%`, background: h.color, opacity: 0.85 }} />
                    </div>
                    <span className="text-[11px] text-fg-3">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[14px] font-semibold">By weekday · 12 weeks</h3>
            {!stats ? (
              <Skeleton className="h-[110px]" />
            ) : (
              <div className="flex flex-col gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const w = stats.weekdays[d]!;
                  return (
                    <div key={d} className="flex items-center gap-2 text-[11.5px]">
                      <span className="w-7 text-fg-3">{WEEKDAY_SHORT[d]}</span>
                      <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-surface-2">
                        {w.scheduled > 0 && <div className="h-full rounded-full" style={{ width: `${w.rate}%`, background: h.color }} />}
                      </div>
                      <span className={cn("w-9 text-right tabular-nums", w.scheduled ? "text-fg-2" : "text-fg-3")}>{w.scheduled ? `${w.rate}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {stats && stats.missedLast14.length > 0 && (
          <p className="text-[12.5px] text-fg-2">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-danger/70 align-middle" />
            Missed {stats.missedLast14.length} scheduled {stats.missedLast14.length === 1 ? "day" : "days"} in the last two weeks.
          </p>
        )}

        <div className="flex items-center gap-2 text-[12.5px] text-fg-2">
          <BellRing className="h-3.5 w-3.5 text-fg-3" />
          {h.reminderTime ? (
            <span>
              Reminder at {h.reminderTime}
              {data?.item.reminder && (
                <span className="text-fg-3"> · next {new Date(data.item.reminder.remindAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
              )}
            </span>
          ) : (
            <span className="text-fg-3">No reminder — add one in Edit.</span>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-[12px] border border-line px-3 py-2.5">
      <p className="text-[11.5px] text-fg-3">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[20px] font-semibold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-[11.5px] text-fg-3">{unit}</span>}
      </p>
    </div>
  );
}
