"use client";
import { cn } from "@/lib/utils";

export function ProgressRing({ value, size = 56, stroke = 5, color, className, label = true }: { value: number; size?: number; stroke?: number; color?: string; className?: string; label?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? "var(--primary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      {label && <span className="absolute text-[12px] font-semibold tabular-nums" style={{ fontSize: Math.max(11, size * 0.22) }}>{v}%</span>}
    </div>
  );
}
