"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, Bell, CalendarDays, Check, CheckCircle2, FileText, ListChecks, Pencil, Search, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { describeToolCall } from "@/lib/ai/describe";
import type { ToolCallRecord } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Check> = {
  create_task: ListChecks,
  update_task: Pencil,
  complete_task: CheckCircle2,
  create_tasks_for_goal: Target,
  create_reminder: Bell,
  create_event: CalendarDays,
  create_note: FileText,
};

/** Small inline chip for read-only tool calls ("Checked schedule"). */
export function ToolActivity({ calls }: { calls: ToolCallRecord[] }) {
  const reads = calls.filter((c) => c.readOnly);
  if (!reads.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {reads.map((c) => (
        <span key={c.id} className={cn("inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 px-2 text-[11.5px]", c.status === "error" ? "text-danger" : "text-fg-3")} title={c.error}>
          {c.status === "error" ? <AlertCircle className="h-3 w-3" /> : <Search className="h-3 w-3" />}
          {c.status === "error" ? `${c.summary ?? c.name} failed` : c.summary ?? c.name}
        </span>
      ))}
    </div>
  );
}

type Decide = (decision: "confirm" | "reject", input?: Record<string, unknown>) => Promise<void>;

export function ToolCallCard({ call, onDecide, compact }: { call: ToolCallRecord; onDecide: Decide; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(call.input);
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = editing ? draft : call.input;
  const d = describeToolCall(call.name, input, call.context);
  const Icon = ICONS[call.name] ?? Check;
  const editable = call.name !== "complete_task";

  const decide = async (decision: "confirm" | "reject") => {
    setBusy(decision);
    setError(null);
    try {
      await onDecide(decision, decision === "confirm" && editing ? diff(call.input, draft) : undefined);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (call.status === "done") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-success/25 bg-success-soft/60 px-3 py-2.5 text-[14px]">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <span className="min-w-0 flex-1 truncate">{call.summary ?? `${d.label} · ${d.primary}`}</span>
        <ResultLink call={call} />
      </div>
    );
  }
  if (call.status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[12.5px] text-fg-3">
        <X className="h-3.5 w-3.5" />
        <span className="truncate line-through">
          {d.label} · {d.primary}
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className={cn("flex items-start gap-2.5", compact ? "p-2.5" : "p-3")}>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{d.label}</p>
          <p className="mt-0.5 text-[14px] leading-snug font-medium break-words">{d.primary}</p>
          {d.meta.length > 0 && <p className="mt-0.5 text-[12px] text-fg-2">{d.meta.join(" · ")}</p>}
          {d.items && !editing && (
            <ul className="mt-2 flex flex-col gap-1 border-l-2 border-line pl-2.5">
              {d.items.map((it, i) => (
                <li key={i} className="text-[12.5px]">
                  {it.title}
                  {it.meta.length > 0 && <span className="text-fg-3"> · {it.meta.join(" · ")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {editing && (
        <div className={cn("border-t border-line bg-surface-2/40", compact ? "p-2.5" : "p-3")}>
          <EditFields name={call.name} draft={draft} setDraft={setDraft} />
        </div>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 border-t border-line px-3 py-2 text-[12px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-1.5 border-t border-line px-2.5 py-2">
        <Button size="sm" variant="ghost" onClick={() => decide("reject")} loading={busy === "reject"} disabled={!!busy}>
          Dismiss
        </Button>
        {editable && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => {
              if (editing) setDraft(call.input);
              setEditing((e) => !e);
            }}
          >
            {editing ? "Cancel edit" : "Edit"}
          </Button>
        )}
        <Button size="sm" onClick={() => decide("confirm")} loading={busy === "confirm"} disabled={!!busy}>
          <Check className="h-3.5 w-3.5" />
          {editing ? "Save & confirm" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}

function diff(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k] === "" ? null : b[k];
  return out;
}

function ResultLink({ call }: { call: ToolCallRecord }) {
  const l = call.link;
  if (!l) return null;
  const cls = "inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-medium text-primary hover:underline";
  if (l.kind === "task" && l.id)
    return (
      <button className={cls} onClick={() => openTaskDialog({ id: l.id })}>
        Open <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    );
  const href = l.href ?? (l.kind === "reminder" ? "/reminders" : l.kind === "event" ? "/calendar" : l.kind === "note" ? "/notes" : l.kind === "goal" ? "/goals" : "/tasks");
  return (
    <Link href={href} className={cls}>
      View <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Inline editing of key fields                                        */
/* ------------------------------------------------------------------ */

function EditFields({ name, draft, setDraft }: { name: string; draft: Record<string, unknown>; setDraft: (fn: (d: Record<string, unknown>) => Record<string, unknown>) => void }) {
  const str = (k: string) => (typeof draft[k] === "string" ? (draft[k] as string) : "");
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v === "" ? null : v }));
  const local = (k: string) => str(k).slice(0, 16).replace(" ", "T");

  const priority = (
    <Field label="Priority">
      <Select value={str("priority")} onChange={(e) => set("priority", e.target.value)}>
        <option value="">Default</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </Select>
    </Field>
  );

  switch (name) {
    case "create_task":
    case "update_task":
      return (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Title" className="col-span-2">
            <Input value={str("title")} onChange={(e) => set("title", e.target.value)} placeholder={name === "update_task" ? "Unchanged" : ""} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={str("dueDate").slice(0, 10)} onChange={(e) => set("dueDate", e.target.value)} />
          </Field>
          {priority}
          <Field label="Start">
            <Input type="time" value={str("startTime")} onChange={(e) => set("startTime", e.target.value)} />
          </Field>
          <Field label="End">
            <Input type="time" value={str("endTime")} onChange={(e) => set("endTime", e.target.value)} />
          </Field>
          {name === "update_task" && (
            <Field label="Status" className="col-span-2">
              <Select value={str("status")} onChange={(e) => set("status", e.target.value)}>
                <option value="">Unchanged</option>
                <option value="NOT_STARTED">Not started</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </Field>
          )}
        </div>
      );
    case "create_reminder":
      return (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Title" className="col-span-2">
            <Input value={str("title")} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="First reminder" className="col-span-2" hint="Leave empty for hourly reminders to start one interval from now">
            <Input type="datetime-local" value={local("remindAt")} onChange={(e) => set("remindAt", e.target.value)} />
          </Field>
          <Field label="Repeat">
            <Select value={str("recurrence") || "NONE"} onChange={(e) => set("recurrence", e.target.value)}>
              <option value="NONE">Once</option>
              <option value="HOURLY">Every N minutes</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </Select>
          </Field>
          <Field label="Interval (min)">
            <Input
              type="number"
              min={5}
              step={5}
              disabled={str("recurrence") !== "HOURLY"}
              value={typeof draft.intervalMinutes === "number" ? draft.intervalMinutes : ""}
              onChange={(e) => set("intervalMinutes", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </div>
      );
    case "create_event":
      return (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Title" className="col-span-2">
            <Input value={str("title")} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Start">
            <Input type="datetime-local" value={local("start")} onChange={(e) => set("start", e.target.value)} />
          </Field>
          <Field label="End">
            <Input type="datetime-local" value={local("end")} onChange={(e) => set("end", e.target.value)} />
          </Field>
        </div>
      );
    case "create_note":
      return (
        <div className="flex flex-col gap-2.5">
          <Field label="Title">
            <Input value={str("title")} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Text">
            <Textarea value={str("text")} onChange={(e) => set("text", e.target.value)} rows={5} />
          </Field>
        </div>
      );
    case "create_tasks_for_goal": {
      const tasks = Array.isArray(draft.tasks) ? (draft.tasks as Record<string, unknown>[]) : [];
      const update = (i: number, patch: Record<string, unknown>) => setDraft((d) => ({ ...d, tasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
      return (
        <div className="flex flex-col gap-2">
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input className="min-w-0 flex-1" value={String(t.title ?? "")} onChange={(e) => update(i, { title: e.target.value })} aria-label={`Task ${i + 1} title`} />
              <Input className="w-[140px] shrink-0" type="date" value={typeof t.dueDate === "string" ? t.dueDate.slice(0, 10) : ""} onChange={(e) => update(i, { dueDate: e.target.value || null })} aria-label={`Task ${i + 1} due date`} />
              <Button size="icon-sm" variant="ghost" aria-label="Remove task" disabled={tasks.length <= 1} onClick={() => setDraft((d) => ({ ...d, tasks: tasks.filter((_, j) => j !== i) }))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      );
    }
  }
  return null;
}
