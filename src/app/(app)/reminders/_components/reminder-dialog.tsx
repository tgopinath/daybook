"use client";
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { zonedToUtc } from "@/lib/time";
import { describeRecurrence, type RecurrenceKind } from "@/lib/recurrence";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { KINDS, WEEKDAYS, draftFromReminder, draftToPayload, emptyDraft, fmtWhen, type Draft, type Repeat, type WireReminder } from "./meta";

export function refreshReminders() {
  return refresh("/api/reminders", "/api/notifications", ...SUMMARY_KEYS);
}

export function ReminderDialog({
  open,
  onOpenChange,
  tz,
  reminder,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tz: string;
  reminder?: WireReminder | null;
  initial?: Partial<Draft>;
}) {
  const [d, setD] = useState<Draft>(() => emptyDraft(tz));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setD(reminder ? draftFromReminder(reminder, tz) : { ...emptyDraft(tz), ...initial });
  }, [open, reminder, initial, tz]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const toggleDay = (day: number) => set("days", d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort());

  const payload = d.date && d.time ? draftToPayload(d, tz) : null;
  const when = payload ? new Date(payload.remindAt) : null;
  const summary = payload
    ? describeRecurrence({ recurrence: payload.recurrence as RecurrenceKind, intervalMinutes: payload.intervalMinutes, daysOfWeek: payload.daysOfWeek })
    : "";

  const validate = (): string | null => {
    if (!d.title.trim()) return "Give the reminder a title.";
    if (!d.date || !d.time) return "Pick a date and time.";
    if ((d.repeat === "weekly" || d.repeat === "weekdays") && d.days.length === 0) return "Pick at least one weekday.";
    if (d.repeat === "interval") {
      const m = d.unit === "hours" ? d.every * 60 : d.every;
      if (!Number.isFinite(m) || m < 5) return "The interval must be at least 5 minutes.";
    }
    if (d.repeat === "none" && when && when.getTime() < Date.now() - 60000 && !reminder) return "That time is in the past. Pick a future time.";
    if (d.repeat !== "none" && d.endDate && zonedToUtc(d.endDate, "23:59", tz) < (when ?? new Date())) return "The end date must be after the first reminder.";
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) return setError(v);
    setSaving(true);
    try {
      if (reminder) {
        await api.patch(`/api/reminders/${reminder.id}`, payload);
        toast.success("Reminder updated");
      } else {
        await api.post("/api/reminders", payload);
        toast.success(`Reminder set for ${when ? fmtWhen(when, tz) : "later"}`);
      }
      void refreshReminders();
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const repeatOptions: { value: Repeat; label: string }[] = [
    { value: "none", label: "Does not repeat" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
    { value: "interval", label: "Custom: every N minutes / hours" },
    { value: "weekdays", label: "Custom: specific weekdays" },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={reminder ? "Edit reminder" : "New reminder"}
      description={`Times are in ${tz.replace(/_/g, " ")}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {reminder ? "Save changes" : "Create reminder"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Title">
          <Input autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Pay electricity bill" maxLength={200} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Type</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const active = d.kind === k.value;
              return (
                <button
                  type="button"
                  key={k.value}
                  onClick={() => set("kind", k.value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
                    active ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  <k.icon className="h-3.5 w-3.5" style={active ? undefined : { color: k.color }} />
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={d.repeat === "none" ? "Date" : "Starts on"}>
            <Input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Time">
            <Input type="time" value={d.time} onChange={(e) => set("time", e.target.value)} required />
          </Field>
        </div>

        <Field label="Repeat">
          <Select value={d.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)}>
            {repeatOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        {(d.repeat === "weekly" || d.repeat === "weekdays") && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">On these days</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((name, i) => {
                const active = d.days.includes(i);
                return (
                  <button
                    type="button"
                    key={name}
                    onClick={() => toggleDay(i)}
                    aria-pressed={active}
                    className={cn(
                      "h-8 w-11 rounded-lg border text-[12.5px] font-medium transition-colors",
                      active ? "border-primary bg-primary text-on-primary" : "border-line text-fg-2 hover:border-line-strong",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {d.repeat === "interval" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Every">
              <Input type="number" min={1} max={d.unit === "hours" ? 720 : 43200} value={d.every} onChange={(e) => set("every", Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Unit">
              <Select value={d.unit} onChange={(e) => set("unit", e.target.value as Draft["unit"])}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </Select>
            </Field>
          </div>
        )}

        {d.repeat !== "none" && (
          <Field label="Ends (optional)" hint="Leave empty to repeat indefinitely.">
            <Input type="date" value={d.endDate} min={d.date} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        )}

        <Field label="Notes (optional)">
          <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={2000} placeholder="Shown in the notification" />
        </Field>

        {reminder && (reminder.task || reminder.habit || reminder.event) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
            <Link2 className="h-3.5 w-3.5" /> Linked to
            {reminder.task && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-fg-2">Task: {reminder.task.title}</span>}
            {reminder.habit && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-fg-2">Habit: {reminder.habit.name}</span>}
            {reminder.event && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-fg-2">Event: {reminder.event.title}</span>}
          </div>
        )}

        <div className="rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px] text-fg-2" aria-live="polite">
          {when ? (
            <>
              <span className="font-medium text-fg">{d.repeat === "none" ? "Reminds you" : "First reminder"}:</span> {fmtWhen(when, tz)}
              {d.repeat !== "none" && <> · {summary}</>}
            </>
          ) : (
            "Pick a date and time"
          )}
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
