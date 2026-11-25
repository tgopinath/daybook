"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalDialog } from "@/components/goals/goal-dialog";
import type { GoalListItem } from "@/components/goals/types";
import { isDone, type TaskList, type WireTask } from "@/components/tasks/types";
import { useApi } from "@/lib/client";
import { GOAL_CATEGORIES } from "@/lib/goals";

type StatusFilter = "ALL" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ABANDONED";
type Sort = "target" | "progress" | "updated" | "title";

export default function GoalsPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useApi<{ items: GoalListItem[] }>("/api/goals");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("target");
  const [dialog, setDialog] = useState<{ open: boolean; goal: GoalListItem | null }>({ open: false, goal: null });
  // Open tasks for the "next steps" on each card (one request, grouped here).
  const { data: taskData } = useApi<TaskList>("/api/tasks?view=active&counts=0");
  const tasksByGoal = useMemo(() => {
    const m = new Map<string, WireTask[]>();
    const due = (t: WireTask) => (t.dueDate ? Date.parse(t.dueDate) : Infinity);
    for (const t of taskData?.items ?? []) {
      if (!t.goalId || isDone(t)) continue;
      m.set(t.goalId, [...(m.get(t.goalId) ?? []), t]);
    }
    for (const list of m.values()) list.sort((a, b) => due(a) - due(b) || a.sortOrder - b.sortOrder);
    return m;
  }, [taskData]);

  const items = data?.items ?? [];
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { ALL: items.length, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0, ABANDONED: 0 };
    for (const g of items) c[g.status]++;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const list = items.filter((g) => (status === "ALL" || g.status === status) && (!category || g.category === category));
    const byTarget = (a: GoalListItem, b: GoalListItem) => (a.targetDate ? Date.parse(a.targetDate) : Infinity) - (b.targetDate ? Date.parse(b.targetDate) : Infinity);
    const sorters: Record<Sort, (a: GoalListItem, b: GoalListItem) => number> = {
      target: byTarget,
      progress: (a, b) => b.progress - a.progress,
      updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...list].sort(sorters[sort]);
  }, [items, status, category, sort]);

  const active = items.filter((g) => g.status === "ACTIVE");
  const avg = active.length ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : 0;
  const overdue = active.filter((g) => g.daysRemaining != null && g.daysRemaining < 0 && g.progress < 100).length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Goals"
        description={
          data && items.length
            ? `${active.length} active · ${avg}% average progress${overdue ? ` · ${overdue} overdue` : ""}`
            : "Long-term outcomes, broken into milestones and tasks."
        }
        actions={
          <Button onClick={() => setDialog({ open: true, goal: null })}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      >
        {items.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
                { value: "ON_HOLD", label: "On hold", count: counts.ON_HOLD },
                { value: "COMPLETED", label: "Completed", count: counts.COMPLETED },
                { value: "ABANDONED", label: "Abandoned", count: counts.ABANDONED },
                { value: "ALL", label: "All", count: counts.ALL },
              ]}
            />
            <div className="flex gap-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="h-8 min-w-[150px] text-[13px]">
                <option value="">All categories</option>
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort goals" className="h-8 min-w-[140px] text-[13px]">
                <option value="target">Target date</option>
                <option value="progress">Progress</option>
                <option value="updated">Recently updated</option>
                <option value="title">Title</option>
              </Select>
            </div>
          </div>
        )}
      </PageHeader>

      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading goals">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[186px] rounded-[14px]" />
          ))}
        </div>
      ) : error && !data ? (
        <EmptyState icon={Target} title="Couldn't load goals" description={error.message} action={<Button variant="outline" onClick={() => mutate()}>Try again</Button>} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Set your first goal"
          description="Pick something meaningful — a 10K, a savings target, a skill. Add milestones and link tasks to see progress build up."
          action={
            <Button onClick={() => setDialog({ open: true, goal: null })}>
              <Plus className="h-4 w-4" /> New goal
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals match these filters"
          description="Try another status or category."
          action={
            <Button variant="outline" onClick={() => { setStatus("ALL"); setCategory(""); }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((g) => (
            <GoalCard key={g.id} goal={g} tasks={taskData ? (tasksByGoal.get(g.id) ?? []) : undefined} onEdit={(goal) => setDialog({ open: true, goal })} />
          ))}
        </div>
      )}

      <GoalDialog
        open={dialog.open}
        goal={dialog.goal}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSaved={(g) => {
          if (!dialog.goal) router.push(`/goals/${g.id}`);
        }}
      />
    </div>
  );
}
