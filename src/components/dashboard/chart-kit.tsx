"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BarChart3 } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface ChartColors {
  primary: string;
  success: string;
  warning: string;
  danger: string;
  text: string;
  text2: string;
  text3: string;
  border: string;
  surface: string;
  surface2: string;
}

const FALLBACK: ChartColors = {
  primary: "#993399",
  success: "#20a779",
  warning: "#e9a23b",
  danger: "#e45d5d",
  text: "#202124",
  text2: "#737780",
  text3: "#9a9ea6",
  border: "#e8eaf0",
  surface: "#ffffff",
  surface2: "#f3f4f7",
};

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    primary: v("--primary", FALLBACK.primary),
    success: v("--success", FALLBACK.success),
    warning: v("--warning", FALLBACK.warning),
    danger: v("--danger", FALLBACK.danger),
    text: v("--text", FALLBACK.text),
    text2: v("--text-2", FALLBACK.text2),
    text3: v("--text-3", FALLBACK.text3),
    border: v("--border", FALLBACK.border),
    surface: v("--surface", FALLBACK.surface),
    surface2: v("--surface-2", FALLBACK.surface2),
  };
}

/**
 * Recharts needs real color strings, so read the theme tokens from :root and
 * re-read whenever the theme class or the accent (inline style) changes.
 */
export function useChartColors() {
  const [colors, setColors] = useState<ChartColors>(FALLBACK);
  useEffect(() => {
    setColors(readColors());
    const mo = new MutationObserver(() => setColors(readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => mo.disconnect();
  }, []);
  return colors;
}

/** Shared axis styling. */
export function axisProps(c: ChartColors) {
  return {
    tick: { fill: c.text3, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;
}

type TooltipPayload = { name?: string | number; value?: number | string | null; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

/** Themed tooltip body for recharts' <Tooltip content={...} />. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelKey = "fullLabel",
  format,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  labelKey?: string;
  format?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const head = (payload[0]?.payload?.[labelKey] as string | undefined) ?? label;
  return (
    <div className="min-w-[140px] rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      {head !== undefined && head !== "" && <div className="mb-1.5 font-medium text-fg">{head}</div>}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-fg-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="flex-1">{p.name}</span>
            <span className="font-medium text-fg tabular-nums">
              {p.value == null ? "—" : format ? format(Number(p.value), String(p.name)) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  empty,
  emptyText = "No data for this period yet",
  emptyIcon: EmptyIcon = BarChart3,
  height = 220,
  className,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
  emptyIcon?: LucideIcon;
  height?: number;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col p-4 md:p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-fg-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div style={{ height }} className="min-w-0">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line text-center">
            <EmptyIcon className="h-5 w-5 text-fg-3" />
            <p className="max-w-[240px] text-[12.5px] text-fg-3">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

export function ChartCardSkeleton({ height = 220 }: { height?: number }) {
  return (
    <Card className="p-4 md:p-5">
      <Skeleton className="mb-1.5 h-4 w-36" />
      <Skeleton className="mb-4 h-3 w-24" />
      <div style={{ height }} className="skeleton w-full" />
    </Card>
  );
}

/** Remembered chart range (per-viewer convenience; safe when storage is blocked). */
export function useStoredRange<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      if (v && allowed.includes(v)) setValue(v);
    } catch {
      /* storage unavailable */
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* storage unavailable */
    }
  };
  return [value, set];
}
