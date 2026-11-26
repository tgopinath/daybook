"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CheckSquare, ChevronDown, Cloud, Heart, History, Images, Mountain, Repeat, RotateCw, Shield,
  ShieldCheck, Smile, StickyNote, Target, Wallet, type LucideIcon,
} from "lucide-react";
import { Card, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { MySpaceWidgetId, WidgetSize } from "./registry";
import { mySpaceMeta } from "./registry";

export const WIDGET_ICONS: Record<MySpaceWidgetId, LucideIcon> = {
  tasks: CheckSquare,
  goals: Target,
  calendar: CalendarDays,
  reminders: Bell,
  habits: Repeat,
  notes: StickyNote,
  journal: BookOpen,
  gratitude: Heart,
  mood: Smile,
  memories: Images,
  bucket: Mountain,
  timeline: History,
  vault: Shield,
  finance: Wallet,
  storage: Cloud,
  security: ShieldCheck,
};

/** Primary quick action (button or link) in a widget footer: 40px tall for touch. */
export const actionCls =
  "inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13.5px] font-medium text-on-primary transition-colors hover:bg-primary-hover outline-none focus-visible:ring-3 focus-visible:ring-primary/30 disabled:opacity-60";
export const secondaryActionCls =
  "inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 text-[13.5px] font-medium text-fg transition-colors hover:bg-surface-2 outline-none focus-visible:ring-3 focus-visible:ring-primary/30";

export function WidgetCard({
  id,
  size,
  stat,
  action,
  children,
  state = "ok",
  onRetry,
  collapsed,
  onToggleCollapse,
}: {
  id: MySpaceWidgetId;
  size: WidgetSize;
  stat?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  state?: "ok" | "loading" | "error";
  onRetry?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const meta = mySpaceMeta(id)!;
  const Icon = WIDGET_ICONS[id];
  const bodyId = `ms-${id}-body`;
  return (
    <Card className={cn("flex min-w-0 flex-col p-4 md:p-5", size === "large" && "md:col-span-2")} aria-labelledby={`ms-${id}-title`} role="region">
      <div className="flex items-start gap-1">
        <Link
          href={meta.href}
          className="group -m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-[12px] p-1.5 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/30"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-primary-soft text-primary" aria-hidden>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={`ms-${id}-title`} className="font-display flex items-center gap-1.5 text-[17px] leading-tight font-semibold text-fg">
              <span className="truncate">{meta.label}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
            </span>
            <span className="mt-0.5 truncate text-[12.5px] text-fg-2">
              {state === "loading" ? <Skeleton className="mt-1 h-3 w-28" /> : state === "error" ? "Not available right now" : stat}
            </span>
            <span className="sr-only">Open {meta.label}</span>
          </span>
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={collapsed ? `Show ${meta.label}` : `Hide ${meta.label}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-fg-2 hover:bg-surface-2 hover:text-fg md:hidden"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
          </button>
        )}
      </div>

      <div id={bodyId} className={cn("mt-4 flex min-h-0 flex-1 flex-col", collapsed && "max-md:hidden")}>
        {state === "loading" ? (
          <WidgetSkeleton />
        ) : state === "error" ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-2.5 rounded-[12px] bg-surface-2 px-3.5 py-4" role="alert">
            <p className="text-[13px] text-fg-2">Couldn&apos;t load {meta.label}.</p>
            {onRetry && (
              <button type="button" onClick={onRetry} className={secondaryActionCls}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col">{children}</div>
        )}
        {state === "ok" && action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </Card>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-4/5" />
    </div>
  );
}

/** Warm empty state inside a widget: one gentle line; the footer carries the primary action. */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="flex flex-1 items-center rounded-[12px] bg-surface-2 px-3.5 py-4 text-[13.5px] leading-relaxed text-fg-2">{children}</p>;
}
