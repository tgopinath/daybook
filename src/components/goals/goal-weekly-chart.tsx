"use client";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyPoint } from "@/lib/goals";

export function GoalWeeklyChart({ data, color, unit, showValue }: { data: WeeklyPoint[]; color: string; unit?: string | null; showValue?: boolean }) {
  const hasTasks = data.some((d) => d.tasksDone > 0);
  const hasProgress = data.some((d) => d.progress > 0);
  if (!hasTasks && !hasProgress) {
    return <p className="flex h-[180px] items-center justify-center text-center text-sm text-fg-3">No progress logged in the last 8 weeks. Update progress, finish a milestone or complete a linked task to see it here.</p>;
  }
  return (
    <div className="h-[200px] w-full" role="img" aria-label="Weekly progress chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-3)" }} interval="preserveStartEnd" />
          <YAxis yAxisId="p" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-3)" }} tickFormatter={(v) => `${v}%`} width={44} />
          <YAxis yAxisId="t" orientation="right" allowDecimals={false} hide />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as WeeklyPoint;
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                  <p className="mb-1 font-medium">Week of {p.label}</p>
                  <p className="text-fg-2">
                    Progress: <span className="font-medium text-fg">{p.progress}%</span>
                    {showValue && p.value != null && (
                      <span className="text-fg-3">
                        {" "}
                        ({p.value.toLocaleString()}
                        {unit ? ` ${unit}` : ""})
                      </span>
                    )}
                  </p>
                  <p className="text-fg-2">
                    Tasks done: <span className="font-medium text-fg">{p.tasksDone}</span>
                  </p>
                </div>
              );
            }}
          />
          {hasTasks && <Bar yAxisId="t" dataKey="tasksDone" fill={color} fillOpacity={0.18} radius={[4, 4, 0, 0]} maxBarSize={28} />}
          <Line yAxisId="p" type="monotone" dataKey="progress" stroke={color} strokeWidth={2} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
