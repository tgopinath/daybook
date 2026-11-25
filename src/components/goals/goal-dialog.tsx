"use client";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { GOAL_CATEGORIES, GOAL_COLORS, GOAL_STATUS_META } from "@/lib/goals";
import { dayKey } from "@/lib/time";
import { useTz } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import type { GoalListItem } from "./types";

type Form = {
  title: string;
  description: string;
  category: string;
  status: string;
  color: string;
  startDate: string;
  targetDate: string;
  targetValue: string;
  currentValue: string;
  unit: string;
};

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalListItem | null;
  onSaved?: (g: GoalListItem) => void;
}) {
  const tz = useTz();
  const [form, setForm] = useState<Form>(() => initial(goal, tz));
  const [milestones, setMilestones] = useState<{ title: string; dueDate: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After creating a goal we offer to add its first tasks right here.
  const [created, setCreated] = useState<GoalListItem | null>(null);
  const [firstTasks, setFirstTasks] = useState(["", "", ""]);

  useEffect(() => {
    if (open) {
      setForm(initial(goal, tz));
      setMilestones([]);
      setError(null);
      setCreated(null);
      setFirstTasks(["", "", ""]);
    }
  }, [open, goal, tz]);

  /** Close the dialog; a freshly created goal is handed to onSaved either way. */
  function close() {
    if (created) onSaved?.(created);
    onOpenChange(false);
  }

  async function addFirstTasks(e?: React.FormEvent) {
    e?.preventDefault();
    if (!created) return;
    const titles = firstTasks.map((t) => t.trim()).filter(Boolean);
    if (!titles.length) return close();
    setSaving(true);
    try {
      for (const title of titles) await api.post("/api/tasks", { title, goalId: created.id });
      await refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);
      toast.success(`Added ${titles.length} ${titles.length === 1 ? "task" : "tasks"} to “${created.title}”`);
      close();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.title.trim()) return setError("Give your goal a title");
    if (form.targetDate && form.startDate && form.targetDate < form.startDate) return setError("Target date is before the start date");
    const targetValue = form.targetValue.trim() ? Number(form.targetValue) : null;
    const currentValue = form.currentValue.trim() ? Number(form.currentValue) : 0;
    if (targetValue !== null && (!Number.isFinite(targetValue) || targetValue <= 0)) return setError("Target value must be a positive number");
    if (!Number.isFinite(currentValue) || currentValue < 0) return setError("Current progress can't be negative");
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      status: form.status,
      color: form.color,
      startDate: form.startDate || undefined,
      targetDate: form.targetDate || null,
      targetValue,
      currentValue,
      unit: form.unit.trim() || null,
      ...(goal ? {} : { milestones: milestones.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), dueDate: m.dueDate || null })) }),
    };
    setSaving(true);
    try {
      const res = goal ? await api.patch<{ item: GoalListItem }>(`/api/goals/${goal.id}`, payload) : await api.post<{ item: GoalListItem }>("/api/goals", payload);
      await refresh("/api/goals", "/api/tasks", ...SUMMARY_KEYS);
      toast.success(goal ? "Goal updated" : "Goal created");
      if (goal) {
        onSaved?.(res.item);
        onOpenChange(false);
      } else {
        setCreated(res.item);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  if (created)
    return (
      <Dialog
        open={open}
        onOpenChange={(o) => !o && close()}
        size="md"
        title="Add first tasks"
        description={`Goals move forward one small step at a time. What are the first steps toward “${created.title}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Skip for now
            </Button>
            <Button onClick={() => void addFirstTasks()} loading={saving} disabled={!firstTasks.some((t) => t.trim())}>
              Add tasks
            </Button>
          </>
        }
      >
        <form onSubmit={addFirstTasks} className="flex flex-col gap-2.5">
          {firstTasks.map((t, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-fg-2 tabular-nums" aria-hidden>
                {i + 1}
              </span>
              <Input
                autoFocus={i === 0}
                value={t}
                onChange={(e) => setFirstTasks((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={["e.g. Buy running shoes", "e.g. Plan a 4-week schedule", "e.g. First 3 km run"][i]}
                aria-label={`First task ${i + 1}`}
                maxLength={300}
              />
            </div>
          ))}
          <p className="mt-1 text-[12px] text-fg-3">They&apos;ll be linked to this goal, so its progress grows as you check them off.</p>
          <button type="submit" className="sr-only">
            Add tasks
          </button>
        </form>
      </Dialog>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={goal ? "Edit goal" : "New goal"}
      description={goal ? undefined : "Set a clear outcome, a deadline and how you'll measure it."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save()} loading={saving}>
            {goal ? "Save changes" : "Create goal"}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Title" error={error ?? undefined}>
          <Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Run a half marathon" maxLength={200} />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Why this matters, what done looks like" className="min-h-[64px]" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {GOAL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(GOAL_STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="Target date">
            <Input type="date" value={form.targetDate} min={form.startDate || undefined} onChange={(e) => set("targetDate", e.target.value)} />
          </Field>
        </div>
        <div className="rounded-[12px] border border-line p-3">
          <p className="mb-3 text-[13px] font-medium text-fg-2">Measure progress (optional)</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Current">
              <Input inputMode="decimal" type="number" min={0} step="any" value={form.currentValue} onChange={(e) => set("currentValue", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Target">
              <Input inputMode="decimal" type="number" min={0} step="any" value={form.targetValue} onChange={(e) => set("targetValue", e.target.value)} placeholder="10" />
            </Field>
            <Field label="Unit">
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="km" maxLength={40} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-fg-3">Without a target, progress comes from milestones, then from linked tasks.</p>
        </div>
        <div>
          <span className="text-[13px] font-medium text-fg-2">Color</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {GOAL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={form.color.toLowerCase() === c.toLowerCase()}
                onClick={() => set("color", c)}
                className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition", form.color.toLowerCase() === c.toLowerCase() && "ring-2")}
                style={{ background: c, ["--tw-ring-color" as string]: c }}
              />
            ))}
          </div>
        </div>
        {!goal && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-fg-2">Milestones</span>
              <Button size="sm" variant="ghost" onClick={() => setMilestones((m) => [...m, { title: "", dueDate: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {milestones.length === 0 ? (
              <p className="text-xs text-fg-3">Break the goal into checkpoints. You can also add them later.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={m.title}
                      autoFocus={i === milestones.length - 1 && !m.title}
                      onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      placeholder={`Milestone ${i + 1}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setMilestones((all) => [...all, { title: "", dueDate: "" }]);
                        }
                      }}
                    />
                    <Input type="date" className="w-[150px] shrink-0" value={m.dueDate} onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} aria-label="Milestone due date" />
                    <Button size="icon-sm" variant="ghost" aria-label="Remove milestone" onClick={() => setMilestones((all) => all.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

function initial(goal: GoalListItem | null | undefined, tz: string): Form {
  const k = (iso: string | null) => (iso ? dayKey(new Date(iso), tz) : "");
  if (!goal)
    return { title: "", description: "", category: "Personal", status: "ACTIVE", color: GOAL_COLORS[0]!, startDate: dayKey(new Date(), tz), targetDate: "", targetValue: "", currentValue: "", unit: "" };
  return {
    title: goal.title,
    description: goal.description ?? "",
    category: goal.category,
    status: goal.status,
    color: goal.color,
    startDate: k(goal.startDate),
    targetDate: k(goal.targetDate),
    targetValue: goal.targetValue != null ? String(goal.targetValue) : "",
    currentValue: goal.currentValue ? String(goal.currentValue) : "",
    unit: goal.unit ?? "",
  };
}
