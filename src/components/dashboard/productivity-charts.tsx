"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RotateCw, Target, Flame, TrendingUp } from "lucide-react";
import { Segmented } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { RANGE_OPTIONS, type RangeKey, type StatsData } from "./types";
import { axisProps, ChartCard, ChartCardSkeleton, ChartTooltip, useChartColors, useStoredRange } from "./chart-kit";

const RANGES = RANGE_OPTIONS.map((o) => o.value);
const UNIT = { day: "day", week: "week", month: "month" } as const;

/** Thin out x-axis ticks on long ranges. */
export const tickInterval = (n: number) => (n > 14 ? Math.ceil(n / 8) - 1 : 0);

export function ProductivityOverview() {
  const [range, setRange] = useStoredRange<RangeKey>("pad-dashboard-range", "7d", RANGES);
  const { data, error, isLoading, mutate } = useApi<StatsData>(`/api/dashboard/stats?range=${range}`);
  const c = useChartColors();
  const ax = axisProps(c);

  const header = (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="font-display text-[17px] font-semibold">Productivity overview</h3>
        <p className="mt-0.5 text-[12px] text-fg-3">
          {data
            ? `${data.totals.completed} tasks completed · ${data.totals.habitRate ?? 0}% habit consistency`
            : "Tasks, goals and habits over time"}
        </p>
      </div>
      <Segmented size="sm" value={range} onChange={setRange} options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
    </div>
  );

  if (error && !data) {
    return (
      <section>
        {header}
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-[14px] text-fg-2">Couldn&apos;t load charts. {error instanceof Error ? error.message : ""}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      </section>
    );
  }

  if (isLoading && !data) {
    return (
      <section>
        {header}
        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          {[0, 1, 2, 3].map((i) => (
            <ChartCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }
  if (!data) return null;

  const unit = UNIT[data.granularity];
  const n = data.buckets.length;
  const noTasks = data.buckets.every((b) => b.completed === 0);
  const noActivity = data.buckets.every((b) => b.completed === 0 && b.habitDone === 0);
  const noHabits = data.buckets.every((b) => b.habitRate == null);
  const grid = <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />;

  return (
    <section aria-label="Productivity overview">
      {header}
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <ChartCard
          title="Task completion"
          subtitle={`Completed per ${unit} · ${data.totals.completed} total`}
          empty={noTasks}
          emptyText="Complete a task and it will show up here"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              {grid}
              <XAxis dataKey="label" {...ax} interval={tickInterval(n)} />
              <YAxis {...ax} allowDecimals={false} />
              <Tooltip cursor={{ fill: c.surface2 }} content={<ChartTooltip />} />
              <Bar dataKey="completed" name="Completed" fill={c.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Productivity"
          subtitle={`Tasks completed and habit check-ins per ${unit}`}
          empty={noActivity}
          emptyIcon={TrendingUp}
          emptyText="Activity from tasks and habits will chart here"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.buckets} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="dash-g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dash-g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.success} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={c.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="label" {...ax} interval={tickInterval(n)} />
              <YAxis {...ax} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11.5, color: c.text2, paddingTop: 4 }} />
              <Area type="monotone" dataKey="habitDone" name="Habit check-ins" stroke={c.success} strokeWidth={2} fill="url(#dash-g2)" />
              <Area type="monotone" dataKey="completed" name="Tasks completed" stroke={c.primary} strokeWidth={2} fill="url(#dash-g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Goal progress"
          subtitle={data.goals.length ? `${data.goals.length} active ${data.goals.length === 1 ? "goal" : "goals"} · actual vs expected by today` : "Active goals"}
          empty={data.goals.length === 0}
          emptyIcon={Target}
          emptyText="Create a goal to see progress here"
          height={Math.max(160, Math.min(320, data.goals.length * 52 + 40))}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.goals} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid horizontal={false} stroke={c.border} strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} {...ax} tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="title" {...ax} width={118} tick={{ fill: c.text2, fontSize: 11.5 }} tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)} />
              <Tooltip cursor={{ fill: c.surface2 }} content={<ChartTooltip labelKey="title" format={(v) => `${v}%`} />} />
              <Bar dataKey="progress" name="Actual" radius={[0, 4, 4, 0]} maxBarSize={14}>
                {data.goals.map((g) => (
                  <Cell key={g.id} fill={g.color} />
                ))}
              </Bar>
              <Bar dataKey="expected" name="Expected" fill={c.text3} fillOpacity={0.45} radius={[0, 4, 4, 0]} maxBarSize={6} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Habit consistency"
          subtitle={`Share of scheduled habit days completed per ${unit}${data.totals.habitRate != null ? ` · ${data.totals.habitRate}% overall` : ""}`}
          empty={noHabits}
          emptyIcon={Flame}
          emptyText="Track a habit to see your consistency"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              {grid}
              <XAxis dataKey="label" {...ax} interval={tickInterval(n)} />
              <YAxis {...ax} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip cursor={{ fill: c.surface2 }} content={<ChartTooltip format={(v) => `${v}%`} />} />
              <Bar dataKey="habitRate" name="Consistency" fill={c.success} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
