"use client";
import { useRouter } from "next/navigation";
import { Bell, Cake, CalendarDays, CheckCircle2, Heart, Star, Users, CalendarClock, type LucideIcon } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/misc";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { cn } from "@/lib/utils";
import type { DashboardData, UpcomingItem, UpcomingType } from "./types";

const TYPE_META: Record<UpcomingType, { icon: LucideIcon; color: string; label: string }> = {
  task: { icon: CheckCircle2, color: "var(--primary)", label: "Task" },
  meeting: { icon: Users, color: "#3b9be9", label: "Meeting" },
  event: { icon: CalendarDays, color: "#3b9be9", label: "Event" },
  personal: { icon: Heart, color: "var(--success)", label: "Personal" },
  reminder: { icon: Bell, color: "var(--warning)", label: "Reminder" },
  date: { icon: Star, color: "var(--danger)", label: "Important date" },
};

function iconFor(it: UpcomingItem) {
  if (it.type === "date" && it.meta === "Birthday") return Cake;
  return TYPE_META[it.type].icon;
}

export function Upcoming({ data, className }: { data: DashboardData; className?: string }) {
  const router = useRouter();
  const total = data.upcoming.reduce((s, d) => s + d.items.length, 0);

  const open = (it: UpcomingItem) => {
    if (it.type === "task") openTaskDialog({ id: it.id });
    else if (it.type === "reminder") router.push("/reminders");
    else router.push(`/calendar?date=${it.dayKey}`);
  };

  return (
    <Card className={cn("flex min-w-0 flex-col p-4 md:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" /> Upcoming
          </h2>
          <p className="mt-0.5 text-[12px] text-fg-3">
            Next 7 days{total ? ` · ${total} ${total === 1 ? "item" : "items"}` : ""}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-[10px] border border-dashed border-line px-4 py-10 text-center">
          <CalendarDays className="h-5 w-5 text-fg-3" />
          <p className="mt-2 text-[13px] text-fg-2">Nothing scheduled in the next 7 days</p>
          <p className="mt-0.5 text-[12px] text-fg-3">Tasks with due dates, events and reminders show up here.</p>
        </div>
      ) : (
        <div className="scroll-thin -mx-1 mt-3 max-h-[560px] flex-1 overflow-y-auto px-1 xl:max-h-none xl:min-h-0">
          {data.upcoming.map((day) => (
            <section key={day.key} className="mb-3 last:mb-0" aria-label={day.label}>
              <h3 className="sticky top-0 z-[1] bg-surface py-1.5 text-[12px] font-semibold text-fg-2">
                {day.label}
                <span className="ml-1.5 font-normal text-fg-3">{day.items.length}</span>
              </h3>
              <ol className="relative ml-[76px] border-l border-line">
                {day.items.map((it) => {
                  const meta = TYPE_META[it.type];
                  const Icon = iconFor(it);
                  const dot = it.color ?? meta.color;
                  return (
                    <li key={it.key} className="relative">
                      <span className="absolute top-[13px] -left-[76px] w-[64px] text-right text-[11.5px] text-fg-3 tabular-nums">{it.time ?? "All day"}</span>
                      <span className="absolute top-[15px] -left-[4.5px] h-2 w-2 rounded-full ring-[3px] ring-surface" style={{ background: dot }} />
                      <button
                        onClick={() => open(it)}
                        className="group ml-2.5 flex w-[calc(100%-10px)] items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-surface-2"
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
                          title={meta.label}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-fg">{it.title}</span>
                          <span className="block truncate text-[11.5px] text-fg-3">
                            {[meta.label, it.endTime && it.time ? `until ${it.endTime}` : null, it.meta].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {it.priority === "HIGH" && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-danger")} title="High priority" />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

export function UpcomingSkeleton() {
  return (
    <Card className="p-4 md:p-5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-3 w-36" />
      {[0, 1].map((g) => (
        <div key={g} className="mt-4">
          <Skeleton className="h-3 w-16" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-2.5 flex items-center gap-3">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}
