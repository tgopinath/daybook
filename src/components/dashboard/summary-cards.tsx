"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell, CalendarDays, CheckCircle2, Flame, NotebookPen, Target, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import { item } from "./motion";

function Ring({ value, size = 44, stroke = 4, color = "var(--primary)" }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (v / 100) * c}
        style={{ transition: "stroke-dashoffset .6s ease-out" }}
      />
    </svg>
  );
}

function SummaryCard({
  href,
  icon: Icon,
  tint,
  label,
  value,
  unit,
  detail,
  aside,
  ariaLabel,
}: {
  href: string;
  icon: LucideIcon;
  tint: string; // CSS color
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail: React.ReactNode;
  aside?: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <motion.div variants={item} className="min-w-0">
      <Link
        href={href}
        aria-label={ariaLabel}
        className="group flex h-full min-w-0 flex-col rounded-[14px] border border-line bg-surface p-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop focus-visible:-translate-y-0.5 sm:p-4"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint }}>
            <Icon className="h-[15px] w-[15px]" />
          </span>
          <span className="truncate text-[12.5px] font-medium text-fg-2">{label}</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[24px] leading-none font-semibold tracking-tight tabular-nums sm:text-[26px]">{value}</span>
              {unit && <span className="truncate text-[12.5px] text-fg-3">{unit}</span>}
            </div>
          </div>
          {aside}
        </div>
        <div className="mt-2.5 truncate text-[12px] text-fg-3 sm:mt-3">{detail}</div>
      </Link>
    </motion.div>
  );
}

export function SummaryCards({ data }: { data: DashboardData }) {
  const { tasks, goals, reminders, habits, calendar, notes } = data;
  return (
    <>
      <SummaryCard
        href="/tasks"
        icon={CheckCircle2}
        tint="var(--primary)"
        label="Today's tasks"
        value={tasks.remaining}
        unit={tasks.total ? "remaining" : "tasks today"}
        ariaLabel={`Today's tasks: ${tasks.completed} of ${tasks.total} done, ${tasks.remaining} remaining`}
        aside={
          <div className="relative hidden sm:block">
            <Ring value={tasks.percent} />
            <span className="absolute inset-0 flex items-center justify-center text-[10.5px] font-semibold tabular-nums">{tasks.percent}%</span>
          </div>
        }
        detail={
          tasks.total ? (
            <>
              {tasks.completed} of {tasks.total} done
              {tasks.overdue > 0 && <span className="text-danger"> · {tasks.overdue} overdue</span>}
            </>
          ) : tasks.overdue > 0 ? (
            <span className="text-danger">{tasks.overdue} overdue</span>
          ) : (
            "Nothing due today"
          )
        }
      />
      <SummaryCard
        href="/goals"
        icon={Target}
        tint="var(--success)"
        label="Active goals"
        value={goals.active}
        unit={goals.active === 1 ? "goal" : "goals"}
        ariaLabel={`Active goals: ${goals.active}, average progress ${goals.avgProgress}%`}
        aside={
          goals.active > 0 ? (
            <div className="relative hidden sm:block">
              <Ring value={goals.avgProgress} color="var(--success)" />
              <span className="absolute inset-0 flex items-center justify-center text-[10.5px] font-semibold tabular-nums">{goals.avgProgress}%</span>
            </div>
          ) : undefined
        }
        detail={goals.active ? `${goals.avgProgress}% average progress${goals.onTrack ? ` · ${goals.onTrack} on track` : ""}` : "Set a goal to track progress"}
      />
      <SummaryCard
        href="/reminders"
        icon={Bell}
        tint="var(--warning)"
        label="Upcoming reminders"
        value={reminders.next24h}
        unit="in next 24h"
        ariaLabel={`${reminders.next24h} reminders in the next 24 hours`}
        detail={
          reminders.next ? (
            <>
              Next: <span className="text-fg-2">{reminders.next.dayLabel !== "Today" ? `${reminders.next.dayLabel} ` : ""}{reminders.next.time}</span> · {reminders.next.title}
            </>
          ) : (
            "No reminders coming up"
          )
        }
      />
      <SummaryCard
        href="/habits"
        icon={Flame}
        tint="#e8793a"
        label="Habits"
        value={
          <>
            {habits.completed}
            <span className="text-fg-3">/{habits.scheduled}</span>
          </>
        }
        unit="done today"
        ariaLabel={`Habits: ${habits.completed} of ${habits.scheduled} done today, best streak ${habits.bestStreak} days`}
        detail={
          habits.total === 0
            ? "Start a habit to build streaks"
            : habits.bestStreak > 0
              ? `Best streak ${habits.bestStreak} ${habits.bestStreak === 1 ? "day" : "days"} · ${habits.bestStreakHabit}`
              : "No active streaks yet"
        }
      />
      <SummaryCard
        href="/calendar"
        icon={CalendarDays}
        tint="#3b9be9"
        label="Calendar"
        value={calendar.today}
        unit={calendar.today === 1 ? "event today" : "events today"}
        ariaLabel={`${calendar.today} events today`}
        detail={
          calendar.next ? (
            <>
              Next: <span className="text-fg-2">{calendar.next.title}</span> · {calendar.next.dayLabel}
              {calendar.next.time ? ` ${calendar.next.time}` : ""}
            </>
          ) : (
            "Nothing scheduled"
          )
        }
      />
      <SummaryCard
        href="/notes"
        icon={NotebookPen}
        tint="#8b5cf6"
        label="Notes"
        value={notes.total}
        unit={notes.total === 1 ? "note" : "notes"}
        ariaLabel={`${notes.total} notes`}
        detail={
          notes.latest ? (
            <>
              <span className="text-fg-2">{notes.latest.title || "Untitled"}</span> · Edited {formatDistanceToNowStrict(new Date(notes.latest.updatedAt), { addSuffix: true })}
            </>
          ) : (
            "Capture your first note"
          )
        }
      />
    </>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={cn("rounded-[14px] border border-line bg-surface p-3.5 sm:p-4")}>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-3 h-6 w-16" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
      ))}
    </>
  );
}
