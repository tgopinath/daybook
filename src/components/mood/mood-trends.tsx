"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarHeart, Flame, Gauge, RotateCw, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Segmented, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { moodMeta } from "@/lib/moods";
import { scoreWord } from "@/lib/mood";
import { axisProps, ChartCard, ChartCardSkeleton, ChartTooltip, useChartColors, useStoredRange } from "@/components/dashboard/chart-kit";
import { MOOD_RANGES, type MoodRange, type MoodStats } from "./types";

const RANGES = MOOD_RANGES.map((r) => r.value);
const tickInterval = (n: number) => (n > 14 ? Math.ceil(n / 8) - 1 : 0);

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Smile; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3.5 md:p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-fg-2">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {label}
      </div>
      <div className="font-display mt-1.5 text-[24px] leading-tight font-semibold text-fg tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-fg-3">{sub}</div>}
    </Card>
  );
}

export function MoodTrends() {
  const [range, setRange] = useStoredRange<MoodRange>("pad-mood-range", "30d", RANGES);
  const { data, error, isLoading, mutate } = useApi<MoodStats>(`/api/mood/stats?range=${range}`);
  const c = useChartColors();
  const ax = axisProps(c);

  const header = (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold">Trends</h2>
        <p className="mt-0.5 text-[12px] text-fg-3">
          {data ? `${data.checkins} check-ins across ${data.daysLogged} ${data.daysLogged === 1 ? "day" : "days"}` : "How your days have felt"}
        </p>
      </div>
      <Segmented size="sm" value={range} onChange={setRange} options={MOOD_RANGES} />
    </div>
  );

  if (error && !data) {
    return (
      <section>
        {header}
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-[13.5px] text-fg-2">Couldn&apos;t load your trends. {error instanceof Error ? error.message : ""}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      </section>
    );
  }

  if (isLoading && !data) {
    return (
      <section aria-busy="true">
        {header}
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-[14px]" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCardSkeleton />
          <ChartCardSkeleton />
        </div>
      </section>
    );
  }
  if (!data) return null;

  const empty = data.checkins === 0;
  const dom = moodMeta(data.dominant);
  const dist = data.distribution.filter((d) => d.count > 0);
  const weekdayData = [...data.weekdays.slice(1), data.weekdays[0]!].map((w) => ({ ...w, label: w.name.slice(0, 3), fullLabel: w.name }));

  return (
    <section>
      {header}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Gauge} label="Average mood" value={data.avgScore != null ? `${data.avgScore}/5` : "—"} sub={data.avgScore != null ? scoreWord(data.avgScore) : "No check-ins yet"} />
        <Kpi icon={Smile} label="Most often" value={dom ? `${dom.emoji} ${dom.label}` : "—"} sub={data.avgIntensity != null ? `Avg intensity ${data.avgIntensity}/5` : undefined} />
        <Kpi icon={Flame} label="Check-in streak" value={`${data.streak.current} ${data.streak.current === 1 ? "day" : "days"}`} sub={`Longest ${data.streak.longest}`} />
        <Kpi
          icon={CalendarHeart}
          label="Best day"
          value={data.bestWeekday?.name ?? "—"}
          sub={data.worstWeekday ? `Toughest: ${data.worstWeekday.name}` : "Needs a few more days"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <ChartCard title="Mood over time" subtitle={data.granularity === "month" ? "Monthly average (1 = rough, 5 = great)" : "Daily average (1 = rough, 5 = great)"} empty={empty} emptyText="Check in a few times and your mood curve will appear here">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={c.border} />
              <XAxis dataKey="label" {...ax} interval={tickInterval(data.series.length)} />
              <YAxis {...ax} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} allowDecimals={false} />
              <Tooltip content={<ChartTooltip format={(v) => `${v} · ${scoreWord(v)}`} />} cursor={{ stroke: c.border }} />
              <Area
                type="monotone"
                dataKey="score"
                name="Mood"
                stroke={c.primary}
                strokeWidth={2}
                fill="url(#moodFill)"
                connectNulls
                dot={data.series.length <= 31 ? { r: 3, fill: c.primary, strokeWidth: 0 } : false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Mood distribution" subtitle="All check-ins in this period" empty={empty} emptyText="Your mix of moods shows up after your first check-in">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dist} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={c.border} />
              <XAxis type="number" {...ax} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...ax} width={86} tickFormatter={(v: string) => `${dist.find((d) => d.label === v)?.emoji ?? ""} ${v}`} />
              <Tooltip content={<ChartTooltip labelKey="label" />} cursor={{ fill: c.surface2 }} />
              <Bar dataKey="count" name="Check-ins" radius={[0, 6, 6, 0]} barSize={16}>
                {dist.map((d) => (
                  <Cell key={d.mood} fill={d.color} stroke={c.text3} strokeWidth={0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="By weekday" subtitle="Average mood per day of the week" empty={data.daysLogged < 2} emptyText="Log a few different days to compare weekdays">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={c.border} />
              <XAxis dataKey="label" {...ax} />
              <YAxis {...ax} domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
              <Tooltip content={<ChartTooltip format={(v) => `${v} · ${scoreWord(v)}`} />} cursor={{ fill: c.surface2 }} />
              <Bar dataKey="avg" name="Average" radius={[6, 6, 0, 0]} barSize={22}>
                {weekdayData.map((w) => (
                  <Cell key={w.weekday} fill={w.name === data.bestWeekday?.name ? c.success : w.name === data.worstWeekday?.name ? c.warning : c.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="flex min-w-0 flex-col p-4 md:p-5">
          <h3 className="text-[14px] font-semibold">What shapes each mood</h3>
          <p className="mt-0.5 mb-3 text-[12px] text-fg-3">Most common factors you tagged</p>
          {data.factorsByMood.every((f) => !f.factors.length) ? (
            <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-[10px] border border-dashed border-line px-4 text-center text-[12.5px] text-fg-3">
              Tag factors like Sleep or Work when you check in to see patterns here
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.factorsByMood
                .filter((f) => f.factors.length)
                .map((f) => {
                  const m = moodMeta(f.mood)!;
                  return (
                    <li key={f.mood} className="flex items-center gap-3 py-2">
                      <span className="w-24 shrink-0 text-[13px] font-medium text-fg">
                        <span aria-hidden>{m.emoji}</span> {m.label}
                      </span>
                      <span className="flex min-w-0 flex-wrap gap-1.5">
                        {f.factors.map((x) => (
                          <span key={x.factor} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[12px] text-fg-2">
                            {x.factor} <span className="text-fg-3 tabular-nums">×{x.count}</span>
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
