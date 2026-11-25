"use client";
import Link from "next/link";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small "part of a goal" chip that links to the goal. Safe inside clickable / draggable rows. */
export function GoalChip({ goal, className }: { goal: { id: string; title: string; color: string }; className?: string }) {
  return (
    <Link
      href={`/goals/${goal.id}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title={`Goal: ${goal.title}`}
      aria-label={`Goal: ${goal.title}`}
      className={cn(
        "inline-flex max-w-[150px] min-w-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:bg-primary-soft hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        className,
      )}
    >
      <Target className="h-3 w-3 shrink-0" style={{ color: goal.color }} aria-hidden />
      <span className="truncate">{goal.title}</span>
    </Link>
  );
}
