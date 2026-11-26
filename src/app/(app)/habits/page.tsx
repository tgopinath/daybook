"use client";
import { useMemo, useState } from "react";
import { Flame, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Progress, Segmented, Skeleton } from "@/components/ui/misc";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitDialog } from "@/components/habits/habit-dialog";
import { HabitDetail } from "@/components/habits/habit-detail";
import { Heatmap, HeatLegend } from "@/components/habits/heatmap";
import { MonthGrid } from "@/components/habits/month-grid";
import { HABITS_KEY } from "@/components/habits/use-habits";
import type { HabitItem, HabitList } from "@/components/habits/types";
import { useApi } from "@/lib/client";
import { useCreateParam } from "@/lib/use-create-param";
import { entryMap, isScheduled } from "@/lib/habits";
import { useMe } from "@/lib/use-me";

type View = "today" | "month";

export default function HabitsPage() {
  const { data, error, isLoading, mutate } = useApi<HabitList>(HABITS_KEY);
  const { data: me } = useMe();
  const [view, setView] = useState<View>("today");
  const [dialog, setDialog] = useState<{ open: boolean; habit: HabitItem | null }>({ open: false, habit: null });
  // /habits?new=1 (the "New" menu, My space) opens a blank habit.
  useCreateParam("new", () => setDialog({ open: true, habit: null }));
  const [detailId, setDetailId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const due = items.filter((h) => h.scheduledToday);
  const rest = items.filter((h) => !h.scheduledToday);
  const summary = data?.summary;
  const detailHabit = items.find((h) => h.id === detailId) ?? null;
  const avg30 = items.length ? Math.round(items.reduce((s, h) => s + h.rate30, 0) / items.length) : 0;

  // Combined heatmap: share of scheduled habits completed each day.
  const combined = useMemo(() => {
    const maps = items.map((h) => ({ h, m: entryMap(h.entries), t: Math.max(1, h.targetPerDay) }));
    return (k: string) => {
      let sched = 0;
      let done = 0;
      for (const { h, m, t } of maps) {
        if (k < h.startKey) continue;
        const ok = (m.get(k) ?? 0) >= t;
        if (!isScheduled(h, k) && !ok) continue;
        sched++;
        if (ok) done++;
      }
      const label = new Date(`${k}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      if (!sched) return { value: null, title: `${label} — nothing scheduled` };
      return { value: done / sched, missed: done === 0 && data?.todayKey !== k, title: `${label} — ${done} of ${sched} done` };
    };
  }, [items, data?.todayKey]);

  const openEdit = (habit: HabitItem) => {
    setDetailId(null);
    setDialog({ open: true, habit });
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Habits"
        description={summary && items.length ? (summary.scheduledToday ? `${summary.doneToday} of ${summary.scheduledToday} done today` : "Nothing scheduled today") : "Small daily actions, tracked honestly."}
        actions={
          <Button onClick={() => setDialog({ open: true, habit: null })}>
            <Plus className="h-4 w-4" /> New habit
          </Button>
        }
      />

      {isLoading && !data ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading habits">
          <Skeleton className="h-[104px] rounded-[14px]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-[14px]" />
          ))}
        </div>
      ) : error && !data ? (
        <EmptyState icon={Repeat} title="Couldn't load habits" description={error.message} action={<Button variant="outline" onClick={() => mutate()}>Try again</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Build your first habit"
          description="Pick one small thing you want to do regularly — drink water, read, walk. Check it off each day and watch the streak grow."
          action={
            <Button onClick={() => setDialog({ open: true, habit: null })}>
              <Plus className="h-4 w-4" /> New habit
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Today summary */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{summary?.message ?? "Your habits"}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={summary?.scheduledToday ? (summary.doneToday / summary.scheduledToday) * 100 : 0} className="max-w-sm" height={8} />
                  <span className="shrink-0 text-xs text-fg-3 tabular-nums">
                    {summary?.doneToday ?? 0}/{summary?.scheduledToday ?? 0}
                  </span>
                </div>
              </div>
              <div className="flex gap-6 sm:border-l sm:border-line sm:pl-6">
                <div>
                  <p className="text-[11.5px] text-fg-3">Longest active streak</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[20px] font-semibold tabular-nums">
                    <Flame className="h-4 w-4 text-warning-text" />
                    {summary?.bestCurrentStreak ?? 0}
                    <span className="text-xs font-normal text-fg-3">{summary?.bestCurrentStreak === 1 ? "day" : "days"}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] text-fg-3">30-day average</p>
                  <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{avg30}%</p>
                </div>
              </div>
            </div>
          </Card>

          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "today", label: "Today" },
              { value: "month", label: "Month" },
            ]}
            className="self-start"
          />

          {view === "today" ? (
            <div className="flex flex-col gap-2.5">
              {due.map((h) => (
                <HabitCard key={h.id} habit={h} onOpen={(x) => setDetailId(x.id)} onEdit={openEdit} />
              ))}
              {due.length === 0 && <p className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-sm text-fg-2">Nothing scheduled today — enjoy the rest day.</p>}
              {rest.length > 0 && (
                <>
                  <h2 className="mt-3 text-[13px] font-medium text-fg-3">Not scheduled today</h2>
                  {rest.map((h) => (
                    <HabitCard key={h.id} habit={h} onOpen={(x) => setDetailId(x.id)} onEdit={openEdit} />
                  ))}
                </>
              )}
            </div>
          ) : (
            <Card className="p-4 sm:p-5">
              <MonthGrid habits={items} todayKey={data!.todayKey} />
            </Card>
          )}

          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold">All habits · last 20 weeks</h2>
                <p className="text-xs text-fg-3">Share of scheduled habits completed each day</p>
              </div>
              <HeatLegend color="#993399" />
            </div>
            <Heatmap todayKey={data!.todayKey} weeks={20} weekStart={me?.settings.weekStart ?? 1} color="#993399" cell={combined} />
          </Card>
        </div>
      )}

      <HabitDialog open={dialog.open} habit={dialog.habit} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <HabitDetail habit={detailHabit} open={!!detailId && !!detailHabit} onOpenChange={(o) => !o && setDetailId(null)} onEdit={openEdit} />
    </div>
  );
}
