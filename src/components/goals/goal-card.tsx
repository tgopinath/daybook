"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, CheckCircle2, Copy, Flag, ListChecks, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge, DemoBadge, Progress } from "@/components/ui/misc";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { describeDaysRemaining, goalCategoryLabel, goalPaceMessage, GOAL_STATUS_META } from "@/lib/goals";
import { cn } from "@/lib/utils";
import { TaskCheck } from "@/components/tasks/task-row";
import { InlineTaskAdd } from "@/components/tasks/inline-add";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { completeWithUndo } from "@/components/tasks/actions";
import type { WireTask } from "@/components/tasks/types";
import { dueInfo } from "@/components/tasks/utils";
import { useTz } from "@/lib/use-me";
import { archiveGoal, deleteGoal, duplicateGoal, setGoalStatus } from "./goal-actions";
import type { GoalListItem } from "./types";

export function formatValue(n: number) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** "Progress is based on 9 linked tasks" — explains how a goal's % is measured. */
export function progressBasis(goal: Pick<GoalListItem, "progressMode" | "taskCounts" | "milestoneCounts">) {
  if (goal.progressMode === "tasks") return `Progress is based on ${goal.taskCounts.total} linked ${goal.taskCounts.total === 1 ? "task" : "tasks"}`;
  if (goal.progressMode === "milestones") return `Progress is based on ${goal.milestoneCounts.total} ${goal.milestoneCounts.total === 1 ? "milestone" : "milestones"}`;
  if (goal.progressMode === "value") return "Progress is based on the value you log";
  return "Link tasks or add milestones to track progress";
}

export function GoalCard({ goal, onEdit, tasks }: { goal: GoalListItem; onEdit: (g: GoalListItem) => void; tasks?: WireTask[] }) {
  const router = useRouter();
  const tz = useTz();
  const days = describeDaysRemaining(goal.status === "COMPLETED" ? null : goal.daysRemaining);
  const status = GOAL_STATUS_META[goal.status];
  const pace = goalPaceMessage(goal.progress, goal.expectedProgress, goal.daysRemaining, goal.status);
  const muted = goal.status === "ABANDONED" || goal.status === "ON_HOLD";

  return (
    <div className={cn("group relative flex flex-col rounded-[14px] border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-pop", muted && "opacity-80")}>
      <Link href={`/goals/${goal.id}`} className="absolute inset-0 rounded-[14px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none" aria-label={`Open ${goal.title}`} />
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: goal.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
            <span>{goalCategoryLabel(goal.category)}</span>
            {goal.status !== "ACTIVE" && <Badge tone={status.tone}>{status.label}</Badge>}
            <DemoBadge show={goal.isDemo} />
          </div>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold">{goal.title}</h3>
        </div>
        <div className="relative z-10 -mt-1 -mr-1">
          <Menu
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label="Goal actions" className="opacity-100 md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            items={[
              { label: "Edit", icon: Pencil, onSelect: () => onEdit(goal) },
              { label: "Duplicate", icon: Copy, onSelect: async () => { const g = await duplicateGoal(goal); if (g) router.push(`/goals/${g.id}`); } },
              goal.status === "COMPLETED"
                ? { label: "Mark active", icon: Flag, onSelect: () => setGoalStatus(goal, "ACTIVE") }
                : { label: "Mark complete", icon: CheckCircle2, onSelect: () => setGoalStatus(goal, "COMPLETED") },
              { label: "Archive", icon: Archive, onSelect: () => archiveGoal(goal) },
              { type: "separator" },
              { label: "Delete", icon: Trash2, danger: true, onSelect: () => deleteGoal(goal) },
            ]}
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[22px] font-semibold tracking-tight tabular-nums">{goal.progress}%</span>
          <span className="truncate text-xs text-fg-3">
            {goal.progressMode === "value" && `${formatValue(goal.currentValue)} / ${formatValue(goal.targetValue!)}${goal.unit ? ` ${goal.unit}` : ""}`}
            {goal.progressMode === "milestones" && `${goal.milestoneCounts.done} of ${goal.milestoneCounts.total} milestones`}
            {goal.progressMode === "tasks" && `${goal.taskCounts.done} of ${goal.taskCounts.total} tasks`}
            {goal.progressMode === "none" && "No progress measure yet"}
          </span>
        </div>
        <Progress value={goal.progress} color={goal.color} />
        {goal.progressMode !== "value" && goal.progressMode !== "milestones" && <p className="mt-1.5 text-[11.5px] text-fg-3">{progressBasis(goal)}</p>}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-2">
        <span className={cn("inline-flex items-center gap-1", days.tone === "danger" && "font-medium text-danger", days.tone === "warning" && "text-warning-text")}>
          <CalendarClock className="h-3.5 w-3.5" />
          {goal.status === "COMPLETED" ? "Completed" : days.label}
        </span>
        {goal.milestoneCounts.total > 0 && (
          <span className="inline-flex items-center gap-1">
            <Flag className="h-3.5 w-3.5" />
            {goal.milestoneCounts.done}/{goal.milestoneCounts.total}
          </span>
        )}
        {goal.taskCounts.total > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" />
            {goal.taskCounts.done}/{goal.taskCounts.total}
          </span>
        )}
        {pace && (
          <span className={cn("ml-auto", pace === "Behind schedule" || pace === "Past the target date" ? "text-danger" : pace === "Ahead of schedule" || pace === "Goal completed" ? "text-success" : "text-fg-3")}>{pace}</span>
        )}
      </div>
      {tasks && goal.status === "ACTIVE" && !goal.deletedAt && (
        <div className="relative z-10 mt-3.5 border-t border-line pt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
            <span className="font-medium text-fg-2">Next steps</span>
            <span className="text-fg-3 tabular-nums">
              {goal.taskCounts.done} of {goal.taskCounts.total} {goal.taskCounts.total === 1 ? "task" : "tasks"} done
            </span>
          </div>
          {tasks.length > 0 ? (
            <ul className="mb-2 flex flex-col">
              {tasks.slice(0, 3).map((t) => {
                const due = dueInfo(t.dueDate, tz);
                return (
                  <li key={t.id} className="flex min-h-9 items-center gap-2.5">
                    <TaskCheck done={t.status === "COMPLETED"} size={16} label={`Complete “${t.title}”`} onToggle={(v) => v && void completeWithUndo(t)} />
                    <button type="button" onClick={() => openTaskDialog({ id: t.id })} className="min-w-0 flex-1 truncate rounded text-left text-[13px] text-fg hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                      {t.title}
                    </button>
                    {due && <span className={cn("shrink-0 text-[11.5px] tabular-nums", due.overdue ? "font-medium text-danger" : "text-fg-3")}>{due.label}</span>}
                  </li>
                );
              })}
              {tasks.length > 3 && (
                <li>
                  <Link href={`/goals/${goal.id}`} className="text-[12px] font-medium text-primary hover:underline">
                    +{tasks.length - 3} more open
                  </Link>
                </li>
              )}
            </ul>
          ) : (
            <p className="mb-2 text-[12px] text-fg-3">{goal.taskCounts.total ? "All linked tasks are done." : "What's the first small step?"}</p>
          )}
          <InlineTaskAdd goalId={goal.id} size="sm" placeholder="Add task…" label={`Add a task to ${goal.title}`} />
        </div>
      )}
      {goal.nextMilestone && goal.status === "ACTIVE" && (
        <p className="mt-3 truncate border-t border-line pt-3 text-xs text-fg-3">
          Next: <span className="text-fg-2">{goal.nextMilestone.title}</span>
        </p>
      )}
    </div>
  );
}
