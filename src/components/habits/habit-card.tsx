"use client";
import { motion } from "framer-motion";
import { Archive, BellRing, Check, Flame, MoreHorizontal, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { DemoBadge } from "@/components/ui/misc";
import { describeSchedule, entryMap, isScheduled, lastDays, WEEKDAY_LETTER } from "@/lib/habits";
import { weekdayOfKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { HabitIcon, tint } from "./habit-icons";
import { archiveHabit, deleteHabit, useCheckin } from "./use-habits";
import type { HabitItem } from "./types";

export function HabitCard({ habit, onOpen, onEdit }: { habit: HabitItem; onOpen: (h: HabitItem) => void; onEdit: (h: HabitItem) => void }) {
  const checkin = useCheckin();
  const target = Math.max(1, habit.targetPerDay);
  const counted = target > 1;
  const pct = Math.min(1, habit.todayCount / target);

  return (
    <div className={cn("group flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-3.5 shadow-card sm:flex-row sm:items-center sm:gap-4", !habit.scheduledToday && "bg-surface/70")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button type="button" onClick={() => onOpen(habit)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${habit.name} details`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(habit.color, 0.13), color: habit.color }}>
            <HabitIcon name={habit.icon} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={cn("truncate text-[14.5px] font-medium", habit.doneToday && "text-fg-2")}>{habit.name}</span>
              <DemoBadge show={habit.isDemo} />
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-fg-3">
              <span>{describeSchedule(habit)}{counted ? ` · ${target}× a day` : ""}</span>
              {habit.streak > 0 && (
                <span className={cn("inline-flex items-center gap-0.5", habit.streak >= 3 && "text-warning-text")}>
                  <Flame className="h-3 w-3" />
                  {habit.streak}
                </span>
              )}
              {habit.reminderTime && (
                <span className="inline-flex items-center gap-0.5">
                  <BellRing className="h-3 w-3" />
                  {habit.reminderTime}
                </span>
              )}
              {!habit.scheduledToday && <span>Rest day</span>}
            </span>
          </span>
        </button>
        <div className="sm:hidden">
          <TodayControl habit={habit} counted={counted} pct={pct} target={target} onToggle={() => checkin(habit)} onDelta={(d) => checkin(habit, habit.todayKey, d)} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <WeekDots habit={habit} onToggle={(k) => checkin(habit, k)} />
        <div className="hidden sm:block">
          <TodayControl habit={habit} counted={counted} pct={pct} target={target} onToggle={() => checkin(habit)} onDelta={(d) => checkin(habit, habit.todayKey, d)} />
        </div>
        <Menu
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Habit actions" className="md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={[
            { label: "Details & stats", icon: Flame, onSelect: () => onOpen(habit) },
            { label: "Edit", icon: Pencil, onSelect: () => onEdit(habit) },
            { label: "Archive", icon: Archive, onSelect: () => archiveHabit(habit) },
            { type: "separator" },
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => deleteHabit(habit) },
          ]}
        />
      </div>
    </div>
  );
}

function TodayControl({ habit, counted, pct, target, onToggle, onDelta }: { habit: HabitItem; counted: boolean; pct: number; target: number; onToggle: () => void; onDelta: (d: 1 | -1) => void }) {
  if (counted) {
    const r = 19;
    const c = 2 * Math.PI * r;
    return (
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label={`Remove one ${habit.name}`} disabled={habit.todayCount <= 0} onClick={() => onDelta(-1)}>
          <Minus className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => onDelta(1)}
          aria-label={`Add one ${habit.name} (${habit.todayCount} of ${target})`}
          className="relative flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          style={habit.doneToday ? { background: habit.color } : undefined}
        >
          {!habit.doneToday && (
            <svg width="44" height="44" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="2.5" />
              <circle cx="22" cy="22" r={r} fill="none" stroke={habit.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - pct * c} style={{ transition: "stroke-dashoffset .3s ease-out" }} />
            </svg>
          )}
          <span className={cn("relative text-[12px] font-semibold tabular-nums", habit.doneToday ? "text-white" : "text-fg")}>
            {habit.todayCount}/{target}
          </span>
        </button>
        <Button size="icon-sm" variant="ghost" aria-label={`Add one ${habit.name}`} onClick={() => onDelta(1)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onToggle}
      role="checkbox"
      aria-checked={habit.doneToday}
      aria-label={habit.doneToday ? `Undo ${habit.name} for today` : `Complete ${habit.name} for today`}
      className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors", !habit.doneToday && "border-line-strong hover:border-[var(--hc)]")}
      style={{ ...(habit.doneToday ? { background: habit.color, borderColor: habit.color } : {}), ["--hc" as string]: habit.color }}
    >
      <motion.span initial={false} animate={{ scale: habit.doneToday ? 1 : 0.6, opacity: habit.doneToday ? 1 : 0.25 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
        <Check className={cn("h-5 w-5", habit.doneToday ? "text-white" : "text-fg-3")} strokeWidth={2.75} />
      </motion.span>
    </motion.button>
  );
}

/** Last 7 days. Tap a past day to backfill or clear it. Missed scheduled days get a red marker. */
export function WeekDots({ habit, onToggle }: { habit: HabitItem; onToggle: (key: string) => void }) {
  const days = lastDays(habit.todayKey, 7);
  const map = entryMap(habit.entries);
  const target = Math.max(1, habit.targetPerDay);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Last 7 days">
      {days.map((k) => {
        const count = map.get(k) ?? 0;
        const done = count >= target;
        const partial = count > 0 && !done;
        const scheduled = isScheduled(habit, k);
        const isToday = k === habit.todayKey;
        const missed = !isToday && scheduled && !done && k >= habit.startKey;
        const dateLabel = new Date(`${k}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            title={`${dateLabel}: ${done ? "done" : partial ? `${count}/${target}` : missed ? "missed" : scheduled ? "not done" : "not scheduled"}`}
            aria-label={`${dateLabel}, ${done ? "done" : missed ? "missed" : "not done"}. Toggle.`}
            className="flex flex-col items-center gap-1"
          >
            <span className={cn("text-[10px] leading-none", isToday ? "font-semibold text-fg-2" : "text-fg-3")}>{WEEKDAY_LETTER[weekdayOfKey(k)]}</span>
            <span
              className={cn(
                "relative flex h-[22px] w-[22px] items-center justify-center rounded-full transition-colors",
                !done && !partial && (scheduled ? "bg-surface-2 hover:bg-line" : "border border-dashed border-line"),
                isToday && !done && "ring-1 ring-fg-3/40",
              )}
              style={done ? { background: habit.color } : partial ? { background: tint(habit.color, 0.3) } : undefined}
            >
              {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              {missed && !partial && <span className="h-1 w-1 rounded-full bg-danger/70" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
