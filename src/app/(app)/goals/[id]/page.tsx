"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, CalendarClock, CheckCircle2, Copy, Flag, Info, ListChecks, MoreHorizontal, Pause, Pencil, Play, RotateCcw, Target, Trash2, TrendingUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Badge, Card, DemoBadge, EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { toastError } from "@/components/ui/toast";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { ProgressRing } from "@/components/goals/progress-ring";
import { MilestoneTimeline } from "@/components/goals/milestone-timeline";
import { GoalTasks } from "@/components/goals/goal-tasks";
import { GoalWeeklyChart } from "@/components/goals/goal-weekly-chart";
import { GoalNotes } from "@/components/goals/goal-notes";
import { UpdateProgressDialog } from "@/components/goals/update-progress-dialog";
import { archiveGoal, deleteGoal, duplicateGoal, setGoalStatus } from "@/components/goals/goal-actions";
import { formatValue, progressBasis } from "@/components/goals/goal-card";
import type { GoalDetail } from "@/components/goals/types";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { describeDaysRemaining, goalCategoryLabel, goalPaceMessage, GOAL_STATUS_META } from "@/lib/goals";
import { dayKey } from "@/lib/time";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const tz = useTz();
  const { data, error, isLoading, mutate } = useApi<{ item: GoalDetail }>(id ? `/api/goals/${id}` : null, { shouldRetryOnError: false });
  const [editOpen, setEditOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const goal = data?.item;

  if (isLoading && !goal) return <DetailSkeleton />;
  if (!goal) {
    return (
      <div className="mx-auto max-w-5xl">
        <BackLink />
        <EmptyState
          icon={Target}
          title={error && "status" in error && (error as { status: number }).status === 404 ? "Goal not found" : "Couldn't load this goal"}
          description={error && "status" in error && (error as { status: number }).status === 404 ? "It may have been permanently deleted." : error?.message}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => mutate()}>
                Try again
              </Button>
              <Button onClick={() => router.push("/goals")}>All goals</Button>
            </div>
          }
        />
      </div>
    );
  }

  const days = describeDaysRemaining(goal.status === "COMPLETED" ? null : goal.daysRemaining);
  const status = GOAL_STATUS_META[goal.status];
  const pace = goalPaceMessage(goal.progress, goal.expectedProgress, goal.daysRemaining, goal.status);
  const fmtDate = (iso: string) => new Date(`${dayKey(new Date(iso), tz)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const inactive = !!goal.deletedAt || !!goal.archivedAt;

  async function restore() {
    try {
      await api.patch(`/api/goals/${goal!.id}`, goal!.deletedAt ? { deletedAt: null } : { archived: false });
      await refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink />

      {inactive && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-fg-2">{goal.deletedAt ? "This goal is in Recently Deleted." : "This goal is archived."}</span>
          <Button size="sm" variant="outline" onClick={restore}>
            {goal.deletedAt ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />} Restore
          </Button>
        </div>
      )}

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <ProgressRing value={goal.progress} size={88} stroke={7} color={goal.color} className="self-start" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
              <span className="h-2 w-2 rounded-full" style={{ background: goal.color }} />
              <span>{goalCategoryLabel(goal.category)}</span>
              <Badge tone={status.tone}>{status.label}</Badge>
              <DemoBadge show={goal.isDemo} />
            </div>
            <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">{goal.title}</h1>
            {goal.description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed whitespace-pre-line text-fg-2">{goal.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-fg-2">
              <span className={cn("inline-flex items-center gap-1.5", days.tone === "danger" && "font-medium text-danger", days.tone === "warning" && "text-warning-text")}>
                <CalendarClock className="h-4 w-4" />
                {goal.status === "COMPLETED" ? "Completed" : days.label}
                {goal.targetDate && <span className="text-fg-3">· {fmtDate(goal.targetDate)}</span>}
              </span>
              <span className="text-fg-3">Started {fmtDate(goal.startDate)}</span>
              {pace && (
                <span className={cn("inline-flex items-center gap-1", pace === "Behind schedule" || pace === "Past the target date" ? "text-danger" : pace === "On track" ? "text-fg-2" : "text-success")}>
                  <TrendingUp className="h-4 w-4" /> {pace}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {goal.progressMode === "value" && !inactive && (
              <Button onClick={() => setProgressOpen(true)}>
                <TrendingUp className="h-4 w-4" /> Update progress
              </Button>
            )}
            <Button variant="outline" size="icon" aria-label="Edit goal" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Menu
              trigger={
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                { type: "label", label: "Status" },
                ...(goal.status !== "COMPLETED" ? [{ label: "Mark complete", icon: CheckCircle2, onSelect: () => setGoalStatus(goal, "COMPLETED") }] : []),
                ...(goal.status !== "ACTIVE" ? [{ label: "Mark active", icon: Play, onSelect: () => setGoalStatus(goal, "ACTIVE") }] : []),
                ...(goal.status !== "ON_HOLD" ? [{ label: "Put on hold", icon: Pause, onSelect: () => setGoalStatus(goal, "ON_HOLD") }] : []),
                ...(goal.status !== "ABANDONED" ? [{ label: "Abandon", icon: XCircle, onSelect: () => setGoalStatus(goal, "ABANDONED") }] : []),
                { type: "separator" as const },
                { label: "Duplicate", icon: Copy, onSelect: async () => { const g = await duplicateGoal(goal); if (g) router.push(`/goals/${g.id}`); } },
                ...(!goal.archivedAt && !goal.deletedAt ? [{ label: "Archive", icon: Archive, onSelect: () => archiveGoal(goal) }] : []),
                ...(!goal.deletedAt ? [{ type: "separator" as const }, { label: "Delete", icon: Trash2, danger: true, onSelect: () => deleteGoal(goal, () => router.push("/goals")) }] : []),
              ]}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat
            label={goal.progressMode === "value" ? "Progress" : "Measured by"}
            value={
              goal.progressMode === "value"
                ? `${formatValue(goal.currentValue)} / ${formatValue(goal.targetValue!)}${goal.unit ? ` ${goal.unit}` : ""}`
                : goal.progressMode === "milestones"
                  ? "Milestones"
                  : goal.progressMode === "tasks"
                    ? "Linked tasks"
                    : "Not set"
            }
          />
          <Stat label="Milestones" value={`${goal.milestoneCounts.done} / ${goal.milestoneCounts.total}`} />
          <Stat label="Tasks" value={`${goal.taskCounts.done} / ${goal.taskCounts.total}`} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-fg-2">
          <Info className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
          {progressBasis(goal)}
          {goal.progressMode === "tasks" && <span className="text-fg-3">· {goal.taskCounts.done} done so far</span>}
        </p>
        {goal.expectedProgress != null && goal.status === "ACTIVE" && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-fg-3">
              <span>
                {goal.progress}% done · {goal.expectedProgress}% of time elapsed
              </span>
            </div>
            <div className="relative">
              <Progress value={goal.progress} color={goal.color} height={8} />
              <span className="absolute -top-1 h-4 w-0.5 rounded bg-fg-3/60" style={{ left: `calc(${goal.expectedProgress}% - 1px)` }} title="Where you'd be at an even pace" aria-hidden />
            </div>
          </div>
        )}
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Section title="Milestones" icon={Flag} meta={goal.milestoneCounts.total ? `${goal.milestoneCounts.done} of ${goal.milestoneCounts.total}` : undefined}>
            <MilestoneTimeline goalId={goal.id} milestones={goal.milestones} color={goal.color} readOnly={!!goal.deletedAt} />
          </Section>
          <Section title={goal.milestones.length ? "Tasks by milestone" : "Tasks"} icon={ListChecks} meta={goal.progressMode === "tasks" ? "Drives progress" : undefined}>
            <GoalTasks goalId={goal.id} color={goal.color} fallback={goal.tasks} milestones={goal.milestones} readOnly={!!goal.deletedAt} />
          </Section>
        </div>
        <div className="flex flex-col gap-5">
          <Section title="Weekly progress" meta="Last 8 weeks">
            <GoalWeeklyChart data={goal.weekly} color={goal.color} unit={goal.unit} showValue={goal.progressMode === "value"} />
          </Section>
          <Section title="Notes">
            <GoalNotes goalId={goal.id} initial={goal.notes} readOnly={!!goal.deletedAt} />
          </Section>
          {goal.progressLogs.length > 0 && goal.progressMode === "value" && (
            <Section title="Progress log">
              <ul className="flex flex-col divide-y divide-line text-[14px]">
                {[...goal.progressLogs].reverse().slice(0, 8).map((l) => (
                  <li key={l.id} className="flex justify-between py-2">
                    <span className="text-fg-2">{fmtDate(l.createdAt)}</span>
                    <span className="font-medium tabular-nums">
                      {formatValue(l.value)}
                      {goal.unit ? ` ${goal.unit}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <GoalDialog open={editOpen} onOpenChange={setEditOpen} goal={goal} />
      {goal.progressMode === "value" && <UpdateProgressDialog open={progressOpen} onOpenChange={setProgressOpen} goal={goal} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/goals" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Goals
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-fg-3">{label}</p>
      <p className="mt-0.5 truncate text-[14px] font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, meta, icon: Icon, children }: { title: string; meta?: string; icon?: typeof Flag; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          {Icon && <Icon className="h-4 w-4 text-fg-3" />}
          {title}
        </h2>
        {meta && <span className="text-xs text-fg-3">{meta}</span>}
      </div>
      {children}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl" aria-busy="true" aria-label="Loading goal">
      <Skeleton className="mb-4 h-4 w-16" />
      <Skeleton className="h-[210px] rounded-[14px]" />
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-[14px]" />
        <Skeleton className="h-[260px] rounded-[14px]" />
      </div>
    </div>
  );
}
