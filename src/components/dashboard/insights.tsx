"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, Flame, Info, Lightbulb, PieChart as PieIcon, RotateCw, Target, TrendingUp } from "lucide-react";
import { Badge, Card, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS, type InsightsData, type RangeKey } from "./types";
import { axisProps, ChartCard, ChartCardSkeleton, ChartTooltip, useChartColors, useStoredRange } from "./chart-kit";
import { container, item } from "./motion";
import { tickInterval } from "./productivity-charts";

const RANGES = RANGE_OPTIONS.map((o) => o.value);
const UNIT = { day: "day", week: "week", month: "month" } as const;

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <motion.div variants={item}>
      <Card className="h-full p-3.5 sm:p-4">
        <div className="truncate text-[12px] font-medium text-fg-3">{label}</div>
        <div className="mt-2 text-[24px] leading-none font-semibold tracking-tight tabular-nums">{value}</div>
        {sub && (
          <div className={cn("mt-2 flex items-center gap-1 truncate text-[11.5px]", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-fg-3")}>
            {tone === "up" && <ArrowUpRight className="h-3 w-3 shrink-0" />}
            {tone === "down" && <ArrowDownRight className="h-3 w-3 shrink-0" />}
            <span className="truncate">{sub}</span>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

const FINDING_ICON = { positive: CheckCircle2, neutral: Info, warning: AlertTriangle } as const;
const FINDING_COLOR = { positive: "text-success", neutral: "text-primary", warning: "text-warning" } as const;

const STATUS_META = {
  ahead: { label: "Ahead", tone: "success" as const },
  "on-track": { label: "On track", tone: "primary" as const },
  behind: { label: "Behind", tone: "warning" as const },
  "no-deadline": { label: "No deadline", tone: "neutral" as const },
};

export function Insights() {
  const [range, setRange] = useStoredRange<RangeKey>("pad-insights-range", "30d", RANGES);
  const { data, error, isLoading, mutate } = useApi<InsightsData>(`/api/dashboard/insights?range=${range}`);
  const c = useChartColors();
  const ax = axisProps(c);

  const header = (
    <PageHeader
      title="Insights"
      description="Patterns from your tasks, habits and goals"
      actions={<Segmented size="sm" value={range} onChange={setRange} options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />}
    />
  );

  if (error && !data) {
    return (
      <>
        {header}
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <h2 className="text-[15px] font-semibold">Couldn&apos;t load insights</h2>
          <p className="text-[13px] text-fg-2">{error instanceof Error ? error.message : "Something went wrong."}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </Button>
        </Card>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <div aria-busy="true" aria-label="Loading insights">
        {header}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-14" />
              <Skeleton className="mt-3 h-3 w-24" />
            </Card>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <ChartCardSkeleton height={240} />
          <div className="lg:col-span-2">
            <ChartCardSkeleton height={240} />
          </div>
          {[0, 1, 2].map((i) => (
            <ChartCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const unit = UNIT[data.granularity];
  const delta = k.prevCompleted > 0 ? Math.round(((k.completed - k.prevCompleted) / k.prevCompleted) * 100) : null;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === data.range)!.label;
  const catTotal = data.byCategory.reduce((s, x) => s + x.count, 0);
  const noTrend = data.trend.every((t) => t.created === 0 && t.completed === 0);

  return (
    <div>
      {header}
      <motion.div variants={container} initial="hidden" animate="show" key={data.range}>
        <motion.div variants={container} className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Tasks completed"
            value={k.completed}
            sub={delta == null ? `in the last ${rangeLabel}` : `${Math.abs(delta)}% vs previous ${rangeLabel}`}
            tone={delta == null || delta === 0 ? undefined : delta > 0 ? "up" : "down"}
          />
          <Kpi label="Completion rate" value={k.completionRate == null ? "—" : `${k.completionRate}%`} sub={k.dueInRange ? `of ${k.dueInRange} tasks due` : "No tasks due in range"} />
          <Kpi label="Avg tasks / day" value={k.avgPerDay} sub={`over ${data.days} days`} />
          <Kpi label="On-time rate" value={k.onTimeRate == null ? "—" : `${k.onTimeRate}%`} sub={k.onTimeBase ? `${k.onTimeBase} tasks with due dates` : "No dated tasks completed"} />
          <Kpi label="Best habit streak" value={`${k.bestStreak}d`} sub={k.bestStreakHabit ?? "No active streak"} />
          <Kpi label="Goals on track" value={k.goalsWithDeadline ? `${k.goalsOnTrack}/${k.goalsWithDeadline}` : "—"} sub={k.goalsWithDeadline ? "with a target date" : "No goals with deadlines"} />
        </motion.div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <motion.div variants={item} className="min-w-0">
            <Card className="flex h-full flex-col p-4 md:p-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <Lightbulb className="h-4 w-4 text-primary" /> Findings
              </h3>
              <p className="mt-0.5 text-[12px] text-fg-3">Computed from your data, last {rangeLabel}</p>
              {data.findings.length === 0 ? (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-fg-3">
                  Not enough activity yet. Complete tasks and check in habits to see patterns.
                </div>
              ) : (
                <ul className="mt-3 flex flex-col">
                  {data.findings.map((f) => {
                    const Icon = FINDING_ICON[f.tone];
                    const body = (
                      <>
                        <Icon className={cn("mt-[2px] h-3.5 w-3.5 shrink-0", FINDING_COLOR[f.tone])} />
                        <span className="flex-1 text-[13px] leading-snug text-fg-2">{f.text}</span>
                        {f.href && <ChevronRight className="mt-[2px] h-3.5 w-3.5 shrink-0 text-fg-3" />}
                      </>
                    );
                    return (
                      <li key={f.id} className="border-b border-line last:border-0">
                        {f.href ? (
                          <Link href={f.href} className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2.5 hover:bg-surface-2">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-start gap-2.5 py-2.5">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </motion.div>

          <motion.div variants={item} className="min-w-0 lg:col-span-2">
            <ChartCard title="Created vs completed" subtitle={`Tasks per ${unit}`} empty={noTrend} emptyIcon={TrendingUp} height={260} className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...ax} interval={tickInterval(data.trend.length)} />
                  <YAxis {...ax} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11.5, color: c.text2, paddingTop: 4 }} />
                  <Line type="monotone" dataKey="created" name="Created" stroke={c.text3} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke={c.primary} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>

          <motion.div variants={item} className="min-w-0">
            <ChartCard title="By day of week" subtitle="When you complete tasks" empty={k.completed === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byWeekday} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />
                  <XAxis dataKey="day" {...ax} />
                  <YAxis {...ax} allowDecimals={false} />
                  <Tooltip cursor={{ fill: c.surface2 }} content={<ChartTooltip labelKey="day" />} />
                  <Bar dataKey="count" name="Completed" fill={c.primary} radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>

          <motion.div variants={item} className="min-w-0">
            <ChartCard title="By category" subtitle="Share of completed tasks" empty={catTotal === 0} emptyIcon={PieIcon}>
              <div className="flex h-full items-center gap-3">
                <div className="relative h-full min-w-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<ChartTooltip labelKey="name" />} />
                      <Pie data={data.byCategory} dataKey="count" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke={c.surface} strokeWidth={2}>
                        {data.byCategory.map((x) => (
                          <Cell key={x.name} fill={x.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[20px] font-semibold tabular-nums">{catTotal}</span>
                    <span className="text-[11px] text-fg-3">completed</span>
                  </div>
                </div>
                <ul className="flex w-[42%] flex-col gap-1.5">
                  {data.byCategory.slice(0, 6).map((x) => (
                    <li key={x.name} className="flex items-center gap-2 text-[12px]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} />
                      <span className="min-w-0 flex-1 truncate text-fg-2">{x.name}</span>
                      <span className="text-fg-3 tabular-nums">{Math.round((x.count / catTotal) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>
          </motion.div>

          <motion.div variants={item} className="min-w-0">
            <ChartCard
              title="By priority"
              subtitle="Completed in range vs still open"
              empty={data.byPriority.every((p) => p.completed === 0 && p.open === 0)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byPriority} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid horizontal={false} stroke={c.border} strokeDasharray="3 3" />
                  <XAxis type="number" {...ax} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" {...ax} width={64} tick={{ fill: c.text2, fontSize: 11.5 }} />
                  <Tooltip cursor={{ fill: c.surface2 }} content={<ChartTooltip labelKey="label" />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11.5, color: c.text2, paddingTop: 4 }} />
                  <Bar dataKey="completed" name="Completed" stackId="p" fill={c.primary} maxBarSize={18} />
                  <Bar dataKey="open" name="Open" stackId="p" fill={c.text3} fillOpacity={0.35} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <motion.div variants={item} className="min-w-0">
            <Card className="h-full p-4 md:p-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <Flame className="h-4 w-4 text-warning-text" /> Habit consistency
              </h3>
              <p className="mt-0.5 text-[12px] text-fg-3">Completed share of scheduled days, per {unit}</p>
              {data.habits.length === 0 ? (
                <div className="mt-4 rounded-[10px] border border-dashed border-line px-4 py-10 text-center text-[12.5px] text-fg-3">
                  No habits yet. <Link href="/habits" className="text-primary hover:underline">Create one</Link> to track consistency.
                </div>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {data.habits.map((h) => (
                    <li key={h.id} className="flex items-center gap-3">
                      <div className="w-[34%] min-w-0 sm:w-36">
                        <div className="truncate text-[12.5px] font-medium">{h.name}</div>
                        <div className="text-[11px] text-fg-3">
                          {h.rate == null ? "Not scheduled" : `${h.rate}%`}
                          {h.streak > 0 && ` · ${h.streak}d streak`}
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-1 gap-[3px]" role="img" aria-label={`${h.name} consistency: ${h.rate ?? 0}%`}>
                        {h.cells.map((cell) => (
                          <span
                            key={cell.key}
                            title={`${cell.label}: ${cell.rate == null ? "not scheduled" : `${cell.rate}%`}`}
                            className="h-5 min-w-0 flex-1 rounded-[4px]"
                            style={{
                              background:
                                cell.rate == null
                                  ? "transparent"
                                  : cell.rate === 0
                                    ? "var(--surface-2)"
                                    : `color-mix(in srgb, ${h.color} ${Math.max(22, cell.rate)}%, var(--surface-2))`,
                              boxShadow: cell.rate == null ? "inset 0 0 0 1px var(--border)" : undefined,
                            }}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>

          <motion.div variants={item} className="min-w-0">
            <Card className="h-full p-4 md:p-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <Target className="h-4 w-4 text-success" /> Goal trajectory
              </h3>
              <p className="mt-0.5 text-[12px] text-fg-3">Actual progress vs where you&apos;d expect to be today</p>
              {data.goals.length === 0 ? (
                <div className="mt-4 rounded-[10px] border border-dashed border-line px-4 py-10 text-center text-[12.5px] text-fg-3">
                  No active goals. <Link href="/goals" className="text-primary hover:underline">Set a goal</Link> to see its trajectory.
                </div>
              ) : (
                <ul className="mt-4 flex flex-col gap-4">
                  {data.goals.map((g) => {
                    const s = STATUS_META[g.status];
                    return (
                      <li key={g.id}>
                        <Link href={`/goals/${g.id}`} className="group block">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium group-hover:text-primary">{g.title}</span>
                            <Badge tone={s.tone}>{s.label}</Badge>
                          </div>
                          <div className="relative h-2 rounded-full bg-surface-2">
                            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${g.progress}%`, background: g.color }} />
                            {g.expected != null && (
                              <span
                                className="absolute -top-1 h-4 w-[2px] rounded-full bg-fg-2"
                                style={{ left: `calc(${g.expected}% - 1px)` }}
                                title={`Expected ${g.expected}%`}
                              />
                            )}
                          </div>
                          <div className="mt-1 flex justify-between text-[11px] text-fg-3 tabular-nums">
                            <span>{g.progress}% done</span>
                            <span>{g.expected == null ? "No target date" : `${g.expected}% expected`}</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
