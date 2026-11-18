"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ListChecks, Plus, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DemoBadge, PRIORITY_META } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { dayKey } from "@/lib/time";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import type { GoalTask, WireMilestone } from "./types";

const sync = () => refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);

export function GoalTasks({ goalId, color, fallback, milestones }: { goalId: string; color: string; fallback: GoalTask[]; milestones: WireMilestone[] }) {
  const tz = useTz();
  const today = dayKey(new Date(), tz);
  const { data, error } = useApi<{ items: GoalTask[] }>(`/api/tasks?goalId=${goalId}&counts=0`, { shouldRetryOnError: false });
  const source = data?.items && !error ? data.items : fallback;
  const [local, setLocal] = useState<Record<string, GoalTask["status"]>>({});
  const [breakOpen, setBreakOpen] = useState(false);
  useEffect(() => setLocal({}), [source]);

  const tasks = useMemo(() => {
    const list = source.filter((t) => t.status !== "CANCELLED").map((t) => ({ ...t, status: local[t.id] ?? t.status }));
    const rank = (t: GoalTask) => (t.status === "COMPLETED" ? 1 : 0);
    return list.sort((a, b) => rank(a) - rank(b) || (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity));
  }, [source, local]);

  const linkedMilestones = new Set(source.map((t) => t.milestoneId).filter(Boolean));
  const remaining = milestones.filter((m) => !m.done && !linkedMilestones.has(m.id));
  const msTitle = new Map(milestones.map((m) => [m.id, m.title]));
  const done = tasks.filter((t) => t.status === "COMPLETED").length;

  async function toggle(t: GoalTask, checked: boolean) {
    const status = checked ? "COMPLETED" : "NOT_STARTED";
    setLocal((l) => ({ ...l, [t.id]: status }));
    try {
      await api.patch(`/api/tasks/${t.id}`, { status });
      await sync();
    } catch (err) {
      setLocal((l) => {
        const { [t.id]: _drop, ...rest } = l;
        return rest;
      });
      toastError(err);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-3">{tasks.length ? `${done} of ${tasks.length} done` : "Tasks you link to this goal show up here."}</p>
        <div className="flex gap-1.5">
          {remaining.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setBreakOpen(true)}>
              <Split className="h-3.5 w-3.5" /> Break into tasks
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => openTaskDialog({ goalId })}>
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center rounded-[12px] border border-dashed border-line px-4 py-8 text-center">
          <ListChecks className="mb-2 h-5 w-5 text-fg-3" />
          <p className="text-sm text-fg-2">No tasks linked yet</p>
          <p className="mt-0.5 text-xs text-fg-3">{remaining.length ? "Turn your milestones into tasks in one step, or add one." : "Add the next concrete step toward this goal."}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-[12px] border border-line">
          {tasks.map((t) => {
            const isDone = t.status === "COMPLETED";
            const dk = t.dueDate ? dayKey(new Date(t.dueDate), tz) : null;
            const overdue = !isDone && dk != null && dk < today;
            return (
              <li key={t.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
                <Checkbox checked={isDone} onChange={(v) => toggle(t, v)} color={color} label={isDone ? `Mark “${t.title}” not done` : `Complete “${t.title}”`} />
                <button type="button" onClick={() => openTaskDialog({ id: t.id })} className="min-w-0 flex-1 text-left">
                  <span className={cn("block truncate text-[13.5px]", isDone && "text-fg-3 line-through decoration-fg-3/60")}>{t.title}</span>
                  {(t.milestoneId && msTitle.get(t.milestoneId)) || t.status === "IN_PROGRESS" ? (
                    <span className="block truncate text-[11.5px] text-fg-3">
                      {t.status === "IN_PROGRESS" && <span className="text-primary">In progress</span>}
                      {t.status === "IN_PROGRESS" && t.milestoneId && " · "}
                      {t.milestoneId && msTitle.get(t.milestoneId)}
                    </span>
                  ) : null}
                </button>
                <DemoBadge show={t.isDemo} />
                {t.priority === "HIGH" && !isDone && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_META.HIGH.color }} title="High priority" />}
                {dk && (
                  <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs text-fg-3", overdue && "font-medium text-danger")}>
                    <CalendarDays className="h-3 w-3" />
                    {dk === today ? "Today" : new Date(`${dk}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <BreakdownDialog open={breakOpen} onOpenChange={setBreakOpen} goalId={goalId} milestones={remaining} tz={tz} />
    </div>
  );
}

function BreakdownDialog({ open, onOpenChange, goalId, milestones, tz }: { open: boolean; onOpenChange: (o: boolean) => void; goalId: string; milestones: WireMilestone[]; tz: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSelected(new Set(milestones.map((m) => m.id)));
  }, [open, milestones]);

  async function run() {
    setBusy(true);
    try {
      const res = await api.post<{ created: number }>(`/api/goals/${goalId}/breakdown`, { milestoneIds: [...selected] });
      await sync();
      toast.success(res.created ? `Created ${res.created} ${res.created === 1 ? "task" : "tasks"}` : "Every selected milestone already has a task");
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Break into tasks"
      description="Creates one task per milestone, linked to this goal and due on the milestone's date."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy} disabled={selected.size === 0}>
            Create {selected.size || ""} {selected.size === 1 ? "task" : "tasks"}
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-1">
        {milestones.map((m) => {
          const on = selected.has(m.id);
          return (
            <li key={m.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={on}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                {m.dueDate && <span className="text-xs text-fg-3">{new Date(`${dayKey(new Date(m.dueDate), tz)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
