"use client";
import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { WEEKDAY_SHORT } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { HABIT_COLORS, HABIT_ICONS, tint } from "./habit-icons";
import type { HabitItem } from "./types";

type Form = {
  name: string;
  description: string;
  icon: string;
  color: string;
  frequency: "daily" | "weekly";
  daysOfWeek: number[];
  targetPerDay: number;
  reminderOn: boolean;
  reminderTime: string;
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HabitDialog({ open, onOpenChange, habit }: { open: boolean; onOpenChange: (o: boolean) => void; habit?: HabitItem | null }) {
  const [form, setForm] = useState<Form>(() => initial(habit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm(initial(habit));
      setError(null);
    }
  }, [open, habit]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) return setError("Give your habit a name");
    if (form.frequency === "weekly" && form.daysOfWeek.length === 0) return setError("Pick at least one day");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon,
      color: form.color,
      frequency: form.frequency,
      daysOfWeek: form.frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : form.daysOfWeek,
      targetPerDay: form.targetPerDay,
      reminderTime: form.reminderOn && form.reminderTime ? form.reminderTime : null,
    };
    setSaving(true);
    try {
      if (habit) await api.patch(`/api/habits/${habit.id}`, payload);
      else await api.post("/api/habits", payload);
      await refresh("/api/habits", "/api/reminders", ...SUMMARY_KEYS);
      toast.success(habit ? "Habit updated" : payload.reminderTime ? `Habit created — reminder set for ${payload.reminderTime}` : "Habit created");
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={habit ? "Edit habit" : "New habit"}
      description={habit ? undefined : "Small, specific and repeatable works best."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save()} loading={saving}>
            {habit ? "Save changes" : "Create habit"}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Name" error={error ?? undefined}>
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Read 20 pages" maxLength={120} />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional — when, where, why" className="min-h-[56px]" maxLength={2000} />
        </Field>

        <div>
          <span className="text-[13px] font-medium text-fg-2">Icon & color</span>
          <div className="mt-1.5 grid grid-cols-10 gap-1.5">
            {Object.entries(HABIT_ICONS).map(([key, { icon: I, label }]) => {
              const on = form.icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={on}
                  onClick={() => set("icon", key)}
                  className={cn("flex aspect-square items-center justify-center rounded-lg border transition-colors", on ? "border-transparent" : "border-line text-fg-2 hover:bg-surface-2")}
                  style={on ? { background: tint(form.color, 0.14), color: form.color, borderColor: tint(form.color, 0.5) } : undefined}
                >
                  <I className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {HABIT_COLORS.map((c) => (
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

        <div>
          <span className="text-[13px] font-medium text-fg-2">Frequency</span>
          <div className="mt-1.5 flex flex-col gap-2.5">
            <Segmented
              value={form.frequency}
              onChange={(v) => setForm((f) => ({ ...f, frequency: v, daysOfWeek: v === "weekly" && f.daysOfWeek.length === 7 ? [1, 2, 3, 4, 5] : f.daysOfWeek }))}
              options={[
                { value: "daily", label: "Every day" },
                { value: "weekly", label: "Specific days" },
              ]}
              size="sm"
              className="self-start"
            />
            {form.frequency === "weekly" && (
              <div className="flex gap-1.5" role="group" aria-label="Days of the week">
                {DAY_ORDER.map((d) => {
                  const on = form.daysOfWeek.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("daysOfWeek", on ? form.daysOfWeek.filter((x) => x !== d) : [...form.daysOfWeek, d].sort())}
                      className={cn("h-9 flex-1 rounded-lg border text-[12.5px] font-medium transition-colors", on ? "border-transparent text-white" : "border-line text-fg-2 hover:bg-surface-2")}
                      style={on ? { background: form.color } : undefined}
                    >
                      {WEEKDAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Target per day" hint={form.targetPerDay > 1 ? `Done after ${form.targetPerDay} check-ins` : "One check-in completes the day"}>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Decrease target" disabled={form.targetPerDay <= 1} onClick={() => set("targetPerDay", Math.max(1, form.targetPerDay - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input type="number" min={1} max={100} value={form.targetPerDay} onChange={(e) => set("targetPerDay", Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))))} className="w-16 text-center tabular-nums" aria-label="Target per day" />
              <Button size="icon" variant="outline" aria-label="Increase target" disabled={form.targetPerDay >= 100} onClick={() => set("targetPerDay", Math.min(100, form.targetPerDay + 1))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">Reminder</span>
            <div className="flex h-9 items-center gap-3">
              <Switch checked={form.reminderOn} onChange={(v) => setForm((f) => ({ ...f, reminderOn: v, reminderTime: f.reminderTime || "08:00" }))} label="Daily reminder" />
              <Input type="time" value={form.reminderTime} disabled={!form.reminderOn} onChange={(e) => set("reminderTime", e.target.value)} className="w-[120px]" aria-label="Reminder time" />
            </div>
            <span className="text-xs text-fg-3">{form.reminderOn ? "Notifies you on scheduled days" : "Off"}</span>
          </div>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

function initial(h?: HabitItem | null): Form {
  if (!h) return { name: "", description: "", icon: "check", color: HABIT_COLORS[1]!, frequency: "daily", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], targetPerDay: 1, reminderOn: false, reminderTime: "08:00" };
  return {
    name: h.name,
    description: h.description ?? "",
    icon: HABIT_ICONS[h.icon] ? h.icon : "check",
    color: h.color,
    frequency: h.frequency === "weekly" && h.daysOfWeek.length < 7 ? "weekly" : "daily",
    daysOfWeek: h.daysOfWeek,
    targetPerDay: h.targetPerDay,
    reminderOn: !!h.reminderTime,
    reminderTime: h.reminderTime ?? "08:00",
  };
}
