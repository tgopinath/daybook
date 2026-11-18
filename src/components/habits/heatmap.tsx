"use client";
import { addDaysKey, weekdayOfKey } from "@/lib/time";
import { WEEKDAY_LETTER } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { tint } from "./habit-icons";

export type HeatCell = {
  /** 0..1 completion intensity; null = nothing scheduled that day. */
  value: number | null;
  missed?: boolean;
  title?: string;
};

/**
 * GitHub-style calendar heatmap: one column per week, rows are weekdays.
 * Ends at `todayKey`; future cells in the last column are left blank.
 */
export function Heatmap({
  todayKey,
  weeks = 20,
  weekStart = 1,
  color,
  cell,
  onSelect,
  size = 12,
  className,
}: {
  todayKey: string;
  weeks?: number;
  weekStart?: number;
  color: string;
  cell: (key: string) => HeatCell;
  onSelect?: (key: string) => void;
  size?: number;
  className?: string;
}) {
  const back = (weekdayOfKey(todayKey) - weekStart + 7) % 7;
  const firstCol = addDaysKey(todayKey, -back - (weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysKey(firstCol, w * 7 + d)));
  const gap = Math.max(2, Math.round(size / 4));
  const monthLabels = cols.map((col, i) => {
    const first = col.find((k) => k.endsWith("-01")) ?? (i === 0 ? col[0] : undefined);
    if (!first) return "";
    return new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  });

  return (
    <div className={cn("overflow-x-auto scroll-thin", className)}>
      <div className="inline-flex flex-col" style={{ gap }}>
        <div className="flex" style={{ gap, paddingLeft: size + gap + 2 }}>
          {monthLabels.map((m, i) => (
            <span key={i} className="text-[10px] leading-none text-fg-3" style={{ width: size, overflow: "visible", whiteSpace: "nowrap" }}>
              {m}
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap }}>
          <div className="flex flex-col pr-0.5" style={{ gap }}>
            {Array.from({ length: 7 }, (_, d) => (
              <span key={d} className="text-center text-[9.5px] leading-none text-fg-3" style={{ width: size, height: size, lineHeight: `${size}px` }}>
                {d % 2 === 1 ? WEEKDAY_LETTER[(weekStart + d) % 7] : ""}
              </span>
            ))}
          </div>
          {cols.map((col, ci) => (
            <div key={ci} className="flex flex-col" style={{ gap }}>
              {col.map((k) => {
                if (k > todayKey) return <span key={k} style={{ width: size, height: size }} />;
                const c = cell(k);
                const bg = c.value == null ? "transparent" : c.value <= 0 ? "var(--surface-2)" : tint(color, 0.25 + 0.75 * Math.min(1, c.value));
                const Comp = onSelect ? "button" : "span";
                return (
                  <Comp
                    key={k}
                    type={onSelect ? "button" : undefined}
                    onClick={onSelect ? () => onSelect(k) : undefined}
                    title={c.title ?? k}
                    aria-label={c.title ?? k}
                    className={cn(
                      "relative rounded-[3px]",
                      c.value == null && "border border-dashed border-line",
                      k === todayKey && "ring-1 ring-fg-3/50 ring-offset-1 ring-offset-surface",
                      onSelect && "transition-transform hover:scale-125",
                    )}
                    style={{ width: size, height: size, background: bg }}
                  >
                    {c.missed && <span className="absolute inset-0 m-auto h-[3px] w-[3px] rounded-full bg-danger/70" aria-hidden />}
                  </Comp>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeatLegend({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
      <span>Less</span>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <span key={v} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: v === 0 ? "var(--surface-2)" : tint(color, 0.25 + 0.75 * v) }} />
      ))}
      <span>More</span>
      <span className="ml-2 inline-flex items-center gap-1">
        <span className="relative h-2.5 w-2.5 rounded-[3px] bg-surface-2">
          <span className="absolute inset-0 m-auto h-[3px] w-[3px] rounded-full bg-danger/70" />
        </span>
        Missed
      </span>
    </div>
  );
}
