"use client";
import Link from "next/link";
import { Archive, ArchiveRestore, Check, Clock, Ellipsis, Link2, Pencil, Repeat, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { describeRecurrence } from "@/lib/recurrence";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Badge, DemoBadge } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/input";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fmtWhen, kindMeta, tomorrowAt, type WireReminder } from "./meta";
import { refreshReminders } from "./reminder-dialog";

async function run(fn: () => Promise<unknown>, msg?: string) {
  try {
    await fn();
    if (msg) toast.success(msg);
    void refreshReminders();
  } catch (err) {
    toastError(err);
  }
}

export function ReminderRow({
  r,
  tz,
  due,
  onEdit,
  archivedView,
}: {
  r: WireReminder;
  tz: string;
  due?: boolean;
  onEdit: (r: WireReminder) => void;
  archivedView?: boolean;
}) {
  const meta = kindMeta(r.kind);
  const Icon = meta.icon;
  const recurring = r.recurrence !== "NONE";
  const completed = r.status === "COMPLETED";
  const snoozedUntil = r.snoozedUntil && new Date(r.snoozedUntil) > new Date() ? new Date(r.snoozedUntil) : null;
  const repeatLabel = recurring ? describeRecurrence({ recurrence: r.recurrence, intervalMinutes: r.intervalMinutes, daysOfWeek: r.daysOfWeek }) : null;

  const complete = () =>
    run(async () => {
      const res = await api.post<{ item: WireReminder }>(`/api/reminders/${r.id}/complete`);
      if (res.item.status === "COMPLETED") {
        toast.undo(`Completed “${r.title}”`, () => run(() => api.patch(`/api/reminders/${r.id}`, { status: "ACTIVE" })));
      } else if (recurring) {
        toast.success(`Next: ${fmtWhen(new Date(res.item.remindAt), tz)}`);
      }
    });

  const reopen = () => run(() => api.patch(`/api/reminders/${r.id}`, { status: "ACTIVE" }), "Reminder reopened");

  const snooze = (body: { minutes?: number; until?: string }, label: string) => run(() => api.post(`/api/reminders/${r.id}/snooze`, body), `Snoozed ${label}`);

  const archive = (archived: boolean) =>
    run(async () => {
      await api.patch(`/api/reminders/${r.id}`, { archived });
      if (archived) toast.undo("Reminder archived", () => run(() => api.patch(`/api/reminders/${r.id}`, { archived: false })));
      else toast.success("Reminder restored");
    });

  const remove = () =>
    run(async () => {
      await api.delete(`/api/reminders/${r.id}`);
      toast.undo("Reminder moved to trash", () => run(() => api.patch(`/api/reminders/${r.id}`, { deletedAt: null })));
    });

  const removePermanently = async () => {
    const ok = await confirm({ title: "Delete reminder permanently?", body: `“${r.title}” will be deleted and can't be restored.`, destructive: true, confirmLabel: "Delete" });
    if (ok) await run(() => api.delete(`/api/reminders/${r.id}?permanent=1`), "Reminder deleted");
  };

  const snoozeItems: MenuItem[] = completed
    ? []
    : [
        { type: "label", label: "Snooze" },
        { label: "5 minutes", icon: Clock, onSelect: () => snooze({ minutes: 5 }, "for 5 minutes") },
        { label: "10 minutes", icon: Clock, onSelect: () => snooze({ minutes: 10 }, "for 10 minutes") },
        { label: "30 minutes", icon: Clock, onSelect: () => snooze({ minutes: 30 }, "for 30 minutes") },
        { label: "1 hour", icon: Clock, onSelect: () => snooze({ minutes: 60 }, "for 1 hour") },
        { label: "Tomorrow, 9:00", icon: Clock, onSelect: () => snooze({ until: tomorrowAt(tz).toISOString() }, "until tomorrow") },
        { type: "separator" },
      ];

  const items: MenuItem[] = archivedView
    ? [
        { label: "Unarchive", icon: ArchiveRestore, onSelect: () => archive(false) },
        { label: "Move to trash", icon: Trash2, onSelect: remove, danger: true },
        { label: "Delete permanently", icon: Trash2, onSelect: removePermanently, danger: true },
      ]
    : [
        ...snoozeItems,
        { label: "Edit", icon: Pencil, onSelect: () => onEdit(r) },
        ...(completed ? [{ label: "Reopen", icon: RotateCcw, onSelect: reopen }] : []),
        ...(recurring && !completed ? [{ label: "Skip next occurrence", icon: SkipForward, onSelect: complete }] : []),
        { label: "Archive", icon: Archive, onSelect: () => archive(true) },
        { type: "separator" },
        { label: "Delete", icon: Trash2, onSelect: remove, danger: true },
      ];

  const when = new Date(r.remindAt);
  const lastFired = r.lastFiredAt ? new Date(r.lastFiredAt) : null;

  return (
    <li className={cn("group flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-surface-2", due && "bg-warning-soft/40 hover:bg-warning-soft/60")}>
      {!archivedView && recurring && !completed && !due && !snoozedUntil ? (
        <span className="w-[18px] shrink-0" aria-hidden />
      ) : !archivedView && (
        <Checkbox
          checked={completed}
          onChange={() => (completed ? reopen() : complete())}
          label={completed ? "Reopen reminder" : recurring ? (snoozedUntil ? "Done" : "Done — skip to next occurrence") : "Mark completed"}
          color="var(--success)"
        />
      )}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]" style={{ background: `${meta.color}1a`, color: meta.color }} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(r)} aria-label={`Edit ${r.title}`}>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-[14px] font-medium", completed && "text-fg-3 line-through")}>{r.title}</span>
          <DemoBadge show={r.isDemo} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
          {completed ? (
            <span>Completed{r.updatedAt ? ` · ${fmtWhen(new Date(r.updatedAt), tz)}` : ""}</span>
          ) : snoozedUntil ? (
            <span className="text-warning-text">Snoozed until {fmtWhen(snoozedUntil, tz)}</span>
          ) : due && lastFired && !recurring ? (
            <span className="text-warning-text">Due {fmtWhen(when, tz)}</span>
          ) : (
            <span>{recurring ? "Next" : ""} {fmtWhen(when, tz)}</span>
          )}
          {repeatLabel && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" /> {repeatLabel}
            </span>
          )}
          {r.notes && <span className="max-w-[260px] truncate">{r.notes}</span>}
        </span>
      </button>
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {r.task && (
          <Link href="/tasks" className="max-w-[160px]" title={`Linked task: ${r.task.title}`}>
            <Badge className="max-w-full">
              <Link2 className="h-3 w-3 shrink-0" /> <span className="truncate">{r.task.title}</span>
            </Badge>
          </Link>
        )}
        {r.habit && (
          <Link href="/habits" className="max-w-[160px]" title={`Linked habit: ${r.habit.name}`}>
            <Badge className="max-w-full">
              <Link2 className="h-3 w-3 shrink-0" /> <span className="truncate">{r.habit.name}</span>
            </Badge>
          </Link>
        )}
        {r.event && (
          <Link href="/calendar" className="max-w-[160px]" title={`Linked event: ${r.event.title}`}>
            <Badge className="max-w-full">
              <Link2 className="h-3 w-3 shrink-0" /> <span className="truncate">{r.event.title}</span>
            </Badge>
          </Link>
        )}
      </div>
      {due && !completed && (
        <button
          onClick={complete}
          className="hidden h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-success hover:bg-success-soft sm:inline-flex"
          title="Mark completed"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
      )}
      <Menu
        trigger={
          <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg" aria-label={`Options for ${r.title}`}>
            <Ellipsis className="h-4 w-4" />
          </button>
        }
        items={items}
      />
    </li>
  );
}
