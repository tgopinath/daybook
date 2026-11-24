"use client";
import type { ReactNode, HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[14px] border border-line bg-surface shadow-card", className)} {...props} />;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "primary" | "success" | "warning" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-fg-2",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-[#b9781a] dark:text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function DemoBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span title="Sample data — delete anytime from Settings → Data" className="inline-flex h-[18px] items-center rounded border border-dashed border-line-strong px-1 text-[10px] font-medium tracking-wide text-fg-3 uppercase">
      Demo
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Progress({ value, className, color, height = 6 }: { value: number; className?: string; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-2", className)} style={{ height }} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${v}%`, background: color ?? "var(--primary)" }} />
    </div>
  );
}

export function PageHeader({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Segmented control used for view switchers and filters. */
export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon; count?: number }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full overflow-x-auto rounded-[10px] bg-surface-2 p-0.5 scroll-thin", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-surface text-fg shadow-card" : "text-fg-2 hover:text-fg",
            )}
          >
            {o.icon && <o.icon className="h-3.5 w-3.5" />}
            {o.label}
            {o.count !== undefined && <span className={cn("text-[11px] tabular-nums", active ? "text-fg-2" : "text-fg-3")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-fg-3">{children}</kbd>;
}

export const PRIORITY_META = {
  HIGH: { label: "High", color: "var(--danger)", tone: "danger" as const },
  MEDIUM: { label: "Medium", color: "var(--warning)", tone: "warning" as const },
  LOW: { label: "Low", color: "var(--text-3)", tone: "neutral" as const },
};
