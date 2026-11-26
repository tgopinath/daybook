"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Heart, Image as ImageIcon, KeyRound, Lock, NotebookPen, Pin, Plus, Sparkles, Upload } from "lucide-react";
import { Checkbox, Textarea } from "@/components/ui/input";
import { Badge, PRIORITY_META, Progress } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb } from "@/components/media/media";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { completeWithUndo } from "@/components/tasks/actions";
import { openEventDialog } from "@/components/calendar/event-dialog";
import { openTxDialog } from "@/components/finance/transaction-dialog";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { moodMeta } from "@/lib/moods";
import { cn } from "@/lib/utils";
import type { MySpaceWidgetId, WidgetSize } from "./registry";
import type { MySpaceSections, SectionId } from "./types";
import { WidgetCard, WidgetEmpty, actionCls, secondaryActionCls } from "./widget-card";

export type Common = {
  size: WidgetSize;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRetry: () => void;
  todayKey: string;
  /** Optimistically patch this widget's section in the cached response. */
  patch: <K extends SectionId>(id: K, fn: (s: NonNullable<MySpaceSections[K]>) => NonNullable<MySpaceSections[K]>) => void;
  /** Re-fetch just this widget's section. */
  reload: () => void;
};

type P<K extends MySpaceWidgetId> = Common & { data: MySpaceSections[K] | undefined; loading: boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rowLink = "flex min-h-11 min-w-0 items-center gap-3 rounded-[10px] px-2 -mx-2 py-1.5 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/30";

function cardState(loading: boolean, data: unknown) {
  return loading && data === undefined ? "loading" : data === null || data === undefined ? "error" : "ok";
}

function shell<K extends MySpaceWidgetId>(id: K, p: P<K>) {
  return { id, size: p.size, collapsed: p.collapsed, onToggleCollapse: p.onToggleCollapse, onRetry: p.onRetry, state: cardState(p.loading, p.data) } as const;
}

// ------------------------------------------------------------------ tasks

export function TasksWidget(p: P<"tasks">) {
  const d = p.data;
  const limit = p.size === "large" ? 8 : 4;
  const stat = d
    ? d.dueToday || d.overdue
      ? [d.dueToday ? `${d.dueToday} due today` : null, d.overdue ? `${d.overdue} overdue` : null].filter(Boolean).join(" · ")
      : d.completedToday
        ? `${plural(d.completedToday, "task")} done today`
        : "Nothing due today"
    : null;

  async function complete(t: NonNullable<MySpaceSections["tasks"]>["items"][number]) {
    p.patch("tasks", (s) => ({
      ...s,
      items: s.items.filter((x) => x.id !== t.id),
      completedToday: s.completedToday + 1,
      dueToday: t.overdue ? s.dueToday : Math.max(0, s.dueToday - 1),
      overdue: t.overdue ? Math.max(0, s.overdue - 1) : s.overdue,
    }));
    const res = await completeWithUndo({ id: t.id, title: t.title, recurrence: t.recurrence as never });
    if (!res) p.reload();
  }

  return (
    <WidgetCard
      {...shell("tasks", p)}
      stat={stat}
      action={
        <button type="button" className={actionCls} onClick={() => openTaskDialog({ dueDate: p.todayKey })}>
          <Plus className="h-4 w-4" aria-hidden /> Task
        </button>
      }
    >
      {d && d.items.length ? (
        <ul className={cn("flex flex-col", p.size === "large" && "md:grid md:grid-cols-2 md:gap-x-6")}>
          {d.items.slice(0, limit).map((t) => (
            <li key={t.id} className="flex min-h-11 items-center gap-3 border-b border-line py-1.5 last:border-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Checkbox checked={false} onChange={() => void complete(t)} label={`Complete ${t.title}`} size={20} />
              </span>
              <button type="button" onClick={() => openTaskDialog({ id: t.id })} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
                <span className="block truncate text-[13.5px] text-fg">{t.title}</span>
                <span className={cn("block text-[12px]", t.overdue ? "font-medium text-danger" : "text-fg-2")}>{t.dueLabel}</span>
              </button>
              {t.priority === "HIGH" && <Badge tone="danger">{PRIORITY_META.HIGH.label}</Badge>}
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>{d?.completedToday ? "All clear for today. Nicely done." : "Nothing on your plate today. Add one small thing that would make it good."}</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ goals

export function GoalsWidget(p: P<"goals">) {
  const d = p.data;
  const limit = p.size === "large" ? 6 : 3;
  return (
    <WidgetCard
      {...shell("goals", p)}
      stat={d ? (d.active ? `${plural(d.active, "active goal")} · ${d.avgProgress}% average` : "No active goals") : null}
      action={
        <Link href="/goals?new=1" className={actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Goal
        </Link>
      }
    >
      {d && d.items.length ? (
        <ul className={cn("flex flex-col gap-3", p.size === "large" && "md:grid md:grid-cols-2 md:gap-x-6")}>
          {d.items.slice(0, limit).map((g) => (
            <li key={g.id} className="min-w-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-[13.5px] font-medium text-fg">{g.title}</span>
                <span className="shrink-0 text-[12.5px] font-semibold text-fg tabular-nums">{g.progress}%</span>
              </div>
              <Progress value={g.progress} color={g.color} />
              {g.targetLabel && <p className="mt-1 text-[12px] text-fg-2">{g.targetLabel}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>What would you love to have done a few months from now? Give it a name.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ calendar

export function CalendarWidget(p: P<"calendar">) {
  const d = p.data;
  const limit = p.size === "large" ? 8 : 4;
  return (
    <WidgetCard
      {...shell("calendar", p)}
      stat={d ? (d.today ? `${plural(d.today, "event")} today` : "Nothing scheduled today") : null}
      action={
        <button type="button" className={actionCls} onClick={() => openEventDialog({})}>
          <Plus className="h-4 w-4" aria-hidden /> Event
        </button>
      }
    >
      {d && d.items.length ? (
        <ul className={cn("flex flex-col", p.size === "large" && "md:grid md:grid-cols-2 md:gap-x-6")}>
          {d.items.slice(0, limit).map((e) => (
            <li key={e.key}>
              <button type="button" onClick={() => openEventDialog({ id: e.id })} className={cn(rowLink, "w-full text-left")}>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: e.color ?? "var(--primary)" }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-fg">{e.title}</span>
                  <span className="block truncate text-[12px] text-fg-2">
                    {e.dayLabel}
                    {e.time ? ` · ${e.time}` : " · All day"}
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Your next three weeks are wide open. Plan something to look forward to.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ reminders

export function RemindersWidget(p: P<"reminders">) {
  const d = p.data;
  const limit = p.size === "large" ? 6 : 3;
  const next = d?.items[0];
  return (
    <WidgetCard
      {...shell("reminders", p)}
      stat={d ? (next ? `Next: ${next.dayLabel === "Today" ? next.time : `${next.dayLabel}, ${next.time}`}` : d.active ? `${d.active} active` : "No reminders set") : null}
      action={
        <Link href="/reminders?new=1" className={actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Reminder
        </Link>
      }
    >
      {d && d.items.length ? (
        <ul className={cn("flex flex-col", p.size === "large" && "md:grid md:grid-cols-2 md:gap-x-6")}>
          {d.items.slice(0, limit).map((r) => (
            <li key={r.key} className="flex min-h-11 items-center gap-3 border-b border-line py-1.5 last:border-0">
              <span className="w-16 shrink-0 text-[12.5px] font-semibold text-fg tabular-nums">{r.time}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-fg">{r.title}</span>
                <span className="block text-[12px] text-fg-2">
                  {r.dayLabel}
                  {r.repeats ? " · Repeats" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Let My Diary remember the little things: water, calls, bills.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ habits

export function HabitsWidget(p: P<"habits">) {
  const d = p.data;
  const [busy, setBusy] = useState<string | null>(null);
  const limit = p.size === "large" ? 10 : 5;

  async function toggle(h: NonNullable<MySpaceSections["habits"]>["items"][number], undo = false) {
    setBusy(h.id);
    const nextDone = !h.done;
    p.patch("habits", (s) => {
      const items = s.items.map((x) => (x.id === h.id ? { ...x, done: nextDone, count: nextDone ? x.target : 0 } : x));
      return { ...s, items, done: items.filter((x) => x.done).length };
    });
    try {
      await api.post(`/api/habits/${h.id}/checkin`, {});
      if (!undo) {
        if (nextDone) toast.undo(`Checked in: ${h.name}`, () => void toggle({ ...h, done: true }, true));
        else toast.success(`Unchecked ${h.name}`);
      }
      refresh("/api/habits", ...SUMMARY_KEYS);
    } catch (err) {
      toastError(err);
      p.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <WidgetCard
      {...shell("habits", p)}
      stat={d ? (d.scheduled ? `${d.done} of ${d.scheduled} done today` : "No habits today") : null}
      action={
        <Link href="/habits?new=1" className={d?.items.length ? secondaryActionCls : actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Habit
        </Link>
      }
    >
      {d && d.items.length ? (
        <ul className={cn("flex flex-col gap-1.5", p.size === "large" && "md:grid md:grid-cols-2 md:gap-x-4")}>
          {d.items.slice(0, limit).map((h) => (
            <li key={h.id}>
              <button
                type="button"
                aria-pressed={h.done}
                disabled={busy === h.id}
                onClick={() => void toggle(h)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-[10px] border px-3 py-1.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 disabled:opacity-70",
                  h.done ? "border-transparent bg-success-soft" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <span
                  className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]", h.done ? "border-success bg-success text-white" : "border-line-strong")}
                  aria-hidden
                >
                  {h.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{h.name}</span>
                {h.streak >= 2 && <span className="shrink-0 text-[12px] font-medium text-fg-2">{h.streak}-day streak</span>}
                <span className="sr-only">{h.done ? ", done today" : ", not done yet"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Small things, done often. Start with one habit you&apos;d like to keep.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ notes

export function NotesWidget(p: P<"notes">) {
  const d = p.data;
  const limit = p.size === "large" ? 6 : 3;
  return (
    <WidgetCard
      {...shell("notes", p)}
      stat={d ? (d.total ? plural(d.total, "note") : "No notes yet") : null}
      action={
        <Link href="/notes?new=1" className={actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Note
        </Link>
      }
    >
      {d && d.items.length ? (
        <ul className={cn("flex flex-col", p.size === "large" && "md:grid md:grid-cols-2 md:gap-x-6")}>
          {d.items.slice(0, limit).map((n) => (
            <li key={n.id}>
              <Link href={`/notes?id=${n.id}`} className={rowLink}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-fg">
                    {n.pinned && <Pin className="h-3 w-3 shrink-0 text-fg-2" aria-label="Pinned" />}
                    <span className="truncate">{n.title}</span>
                  </span>
                  <span className="block truncate text-[12px] text-fg-2">
                    {n.updatedLabel}
                    {n.preview ? ` · ${n.preview}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Ideas, lists, things to remember. Jot the first one down.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ journal

export function JournalWidget(p: P<"journal">) {
  const d = p.data;
  const l = d?.latest;
  const m = moodMeta(l?.mood);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  /** Quick write: a finished (non-draft) entry dated today. */
  async function save() {
    const content = text.trim();
    if (!content) return;
    setSaving(true);
    try {
      const { entry } = await api.post<{ entry: { id: string } }>("/api/dashboard/journal", { content });
      setText("");
      setSaved(entry.id);
      p.patch("journal", (s) => ({ ...s, todayCount: s.todayCount + 1, total: s.total + 1 }));
      toast.success("Saved to your journal");
      refresh("/api/journal", "/api/weekly-review", ...SUMMARY_KEYS);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WidgetCard
      {...shell("journal", p)}
      stat={d ? (d.todayCount ? `You've written today${d.streak >= 2 ? ` · ${d.streak}-day streak` : ""}` : d.streak >= 2 ? `${d.streak}-day streak` : d.total ? plural(d.total, "entry", "entries") : "A fresh notebook") : null}
      action={
        <>
          <button type="button" className={actionCls} onClick={() => void save()} disabled={saving || !text.trim()} aria-busy={saving || undefined}>
            <NotebookPen className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : "Save entry"}
          </button>
          <Link href="/journal?new=1" className={secondaryActionCls}>
            <Sparkles className="h-4 w-4" aria-hidden /> Full editor
          </Link>
        </>
      }
    >
      <label htmlFor="ms-journal-quick" className="sr-only">
        What&apos;s on your mind today?
      </label>
      <Textarea
        id="ms-journal-quick"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (saved) setSaved(null);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="What's on your mind today?"
        maxLength={20000}
        className="min-h-[88px] resize-none"
      />
      <p className="mt-1.5 text-[12px] text-fg-2" aria-live="polite">
        {saved ? (
          <Link href={`/journal?id=${saved}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <Check className="h-3.5 w-3.5" aria-hidden /> Saved · Open in Journal
          </Link>
        ) : (
          "Saved as today's entry. ⌘ + Enter to save."
        )}
      </p>
      {l && (
        <Link href={`/journal?id=${l.id}`} className={cn(rowLink, "mt-2 items-start")}>
          {m && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[20px]" style={{ background: `color-mix(in oklab, ${m.color} 22%, var(--surface))` }} aria-hidden>
              {m.emoji}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="text-[12px] text-fg-2">Latest · {l.dateLabel}</span>
            <span className="font-display block truncate text-[16px] font-semibold text-fg">
              {l.isPrivate ? (
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Private entry
                </span>
              ) : (
                (l.title ?? "Untitled entry")
              )}
            </span>
            {l.wordCount > 0 && <span className="block text-[12px] text-fg-2">{plural(l.wordCount, "word")}</span>}
          </span>
        </Link>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ gratitude

export function GratitudeWidget(p: P<"gratitude">) {
  const d = p.data;
  return (
    <WidgetCard
      {...shell("gratitude", p)}
      stat={d ? (d.today ? (d.streak >= 2 ? `Done today · ${d.streak}-day streak` : "Done today") : d.streak ? `${d.streak}-day streak, keep it going` : "Not yet today") : null}
      action={
        <Link href="/gratitude" className={d?.today ? secondaryActionCls : actionCls}>
          <Heart className="h-4 w-4" aria-hidden /> {d?.today ? "Edit today" : "Add today's gratitude"}
        </Link>
      }
    >
      {d?.today ? (
        <ol className="flex flex-col gap-2">
          {d.today.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-fg">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-[11px] font-semibold text-success">{i + 1}</span>
              <span className="min-w-0">{it}</span>
            </li>
          ))}
        </ol>
      ) : (
        <WidgetEmpty>Three small good things from today: a warm cup, a kind word, a quiet moment.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ memories

export function MemoriesWidget(p: P<"memories">) {
  const d = p.data;
  const limit = p.size === "large" ? 8 : 4;
  return (
    <WidgetCard
      {...shell("memories", p)}
      stat={d ? (d.total ? plural(d.total, "memory", "memories") : "No memories yet") : null}
      action={
        <Link href="/memories?new=1" className={actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Memory
        </Link>
      }
    >
      {d?.onThisDay.first && (
        <Link href={`/memories/${d.onThisDay.first.id}`} className="mb-3 flex min-h-11 items-center gap-2.5 rounded-[12px] bg-primary-soft px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px] text-fg">
            <span className="font-semibold">On this day</span> · {d.onThisDay.first.yearsAgo} {d.onThisDay.first.yearsAgo === 1 ? "year" : "years"} ago:{" "}
            <span className="truncate">{d.onThisDay.first.title}</span>
            {d.onThisDay.count > 1 ? ` and ${d.onThisDay.count - 1} more` : ""}
          </span>
        </Link>
      )}
      {d && d.items.length ? (
        <ul className={cn("grid grid-cols-4 gap-2", p.size === "large" && "md:grid-cols-8")}>
          {d.items.slice(0, limit).map((m) => (
            <li key={m.id} className="min-w-0">
              <Link href={`/memories/${m.id}`} className="block rounded-[10px] outline-none focus-visible:ring-3 focus-visible:ring-primary/30" title={`${m.title} · ${m.dateLabel}`}>
                {m.cover ? (
                  <MediaThumb media={m.cover} alt={m.title} className="aspect-square rounded-[10px]" />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center rounded-[10px] bg-surface-2 text-fg-2">
                    <ImageIcon className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <span className="sr-only">
                  {m.title}, {m.dateLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Moments worth keeping will live here: a trip, a dinner, an ordinary good day.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ bucket list

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} />
    </svg>
  );
}

export function BucketWidget(p: P<"bucket">) {
  const d = p.data;
  return (
    <WidgetCard
      {...shell("bucket", p)}
      stat={d ? (d.total ? `${d.done} of ${d.total} done` : "Your list is empty") : null}
      action={
        <Link href="/bucket-list?new=1" className={actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Dream
        </Link>
      }
    >
      {d && d.total ? (
        <div className="flex items-center gap-4">
          <div className="relative">
            <Ring value={d.percent} />
            <span className="font-display absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-fg tabular-nums">{d.percent}%</span>
          </div>
          <div className="min-w-0 flex-1">
            {d.next ? (
              <Link href={`/bucket-list?id=${d.next.id}`} className="block rounded-md outline-none hover:underline focus-visible:ring-3 focus-visible:ring-primary/30">
                <span className="block text-[12px] text-fg-2">Up next · {d.next.category}</span>
                <span className="block truncate text-[14px] font-medium text-fg">{d.next.title}</span>
                {d.next.targetLabel && <span className="block text-[12px] text-fg-2">By {d.next.targetLabel}</span>}
              </Link>
            ) : (
              <p className="text-[13.5px] text-fg">Every dream ticked off. Time to dream bigger.</p>
            )}
          </div>
        </div>
      ) : (
        <WidgetEmpty>Places to see, things to try, someday-maybes. Write the first one down.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ timeline

export function TimelineWidget(p: P<"timeline">) {
  const d = p.data;
  return (
    <WidgetCard
      {...shell("timeline", p)}
      stat={d ? (d.total ? plural(d.total, "moment") : "Your story starts here") : null}
      action={
        <Link href="/timeline?new=1" className={actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Moment
        </Link>
      }
    >
      {d?.latest ? (
        <Link href={`/timeline?id=${d.latest.id}`} className={cn(rowLink, "items-start")}>
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="text-[12px] text-fg-2">
              Latest · {d.latest.dateLabel} · {d.latest.category}
            </span>
            <span className="font-display block truncate text-[16px] font-semibold text-fg">{d.latest.title}</span>
          </span>
        </Link>
      ) : (
        <WidgetEmpty>Milestones big and small: first job, a move, the day you met. Add a chapter.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ vault

export function VaultWidget(p: P<"vault">) {
  const d = p.data;
  return (
    <WidgetCard
      {...shell("vault", p)}
      stat={d ? (d.total ? `${plural(d.total, "item")}, encrypted` : "Nothing saved yet") : null}
      action={
        <Link href="/vault" className={d?.total ? secondaryActionCls : actionCls}>
          <Plus className="h-4 w-4" aria-hidden /> Add details
        </Link>
      }
    >
      {d && d.categories.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Items by category">
          {d.categories.slice(0, 8).map((c) => (
            <li key={c.category} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-[12.5px] text-fg">
              {c.category}
              <span className="font-semibold tabular-nums">{c.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Emergency contacts, policies, IDs: kept encrypted, ready when you need them.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ storage

export function StorageWidget(p: P<"storage">) {
  const d = p.data;
  return (
    <WidgetCard
      {...shell("storage", p)}
      stat={d ? (d.bytesUsed ? `${d.label} used${d.files ? ` · ${plural(d.files, "file")}` : ""}` : "Nothing stored yet") : null}
      action={
        <Link href="/drive" className={actionCls}>
          <Upload className="h-4 w-4" aria-hidden /> Upload
        </Link>
      }
    >
      {d && d.recent.length ? (
        <ul className="flex flex-col">
          {d.recent.map((f) => (
            <li key={f.id} className="flex min-h-11 items-center gap-3 border-b border-line py-1.5 last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-fg">{f.name}</span>
                <span className="block text-[12px] text-fg-2">
                  {f.sizeLabel} · {f.updatedLabel}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>{d?.bytesUsed ? "Photos and attachments are here. Add documents to keep them all in one place." : "Keep documents, scans and files safe in one place."}</WidgetEmpty>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ security

function StatusRow({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-line py-1.5 last:border-0">
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", on ? "bg-success-soft text-success" : "bg-warning-soft text-warning-text")} aria-hidden>
        {on ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <KeyRound className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-fg">{label}</span>
        <span className={cn("block text-[12px]", on ? "text-fg-2" : "font-medium text-warning-text")}>{detail}</span>
      </span>
    </li>
  );
}

export function SecurityWidget(p: P<"security">) {
  const d = p.data;
  const allGood = d && d.twoFactor && d.appLock;
  return (
    <WidgetCard
      {...shell("security", p)}
      stat={d ? (allGood ? "Well protected" : d.twoFactor ? "App lock is off" : "2-step sign-in is off") : null}
      action={
        <Link href="/security" className={allGood ? secondaryActionCls : actionCls}>
          <ShieldIcon /> {allGood ? "Review" : "Strengthen"}
        </Link>
      }
    >
      {d && (
        <ul className="flex flex-col">
          <StatusRow on={d.twoFactor} label="2-step sign-in" detail={d.twoFactor ? `On · ${plural(d.backupCodesLeft, "backup code")} left` : "Off. Add a code from your phone."} />
          <StatusRow on={d.appLock} label="App lock" detail={d.appLock ? `On${d.appLockMinutes ? ` · locks after ${d.appLockMinutes} min` : ""}` : "Off. Add a PIN for this device."} />
        </ul>
      )}
    </WidgetCard>
  );
}
const ShieldIcon = () => <Lock className="h-4 w-4" aria-hidden />;

// ------------------------------------------------------------------ finance

export function FinanceWidget(p: P<"finance">) {
  const d = p.data;
  const b = d?.budget;
  return (
    <WidgetCard
      {...shell("finance", p)}
      stat={d ? (d.count ? `${d.expenseLabel} spent in ${d.monthLabel.split(" ")[0]}` : `Nothing logged in ${d.monthLabel.split(" ")[0]}`) : null}
      action={
        <>
          <button type="button" className={actionCls} onClick={() => openTxDialog({ preset: { type: "expense" } })}>
            <Plus className="h-4 w-4" aria-hidden /> Expense
          </button>
          <button type="button" className={secondaryActionCls} onClick={() => openTxDialog({ preset: { type: "income" } })}>
            <Plus className="h-4 w-4" aria-hidden /> Income
          </button>
        </>
      }
    >
      {d && d.count ? (
        <div className={cn("flex flex-col gap-3", p.size === "large" && "md:flex-row md:items-start md:gap-6")}>
          <dl className="grid flex-1 grid-cols-3 gap-2">
            {[
              { k: "Income", v: d.incomeLabel },
              { k: "Spent", v: d.expenseLabel },
              { k: "Net", v: d.netLabel, tone: d.net < 0 ? "text-danger" : "text-success" },
            ].map((t) => (
              <div key={t.k} className="min-w-0 rounded-[12px] bg-surface-2 px-2.5 py-2">
                <dt className="text-[12px] font-medium text-fg-2">{t.k}</dt>
                <dd className={cn("font-display truncate text-[16px] font-semibold tabular-nums", t.tone ?? "text-fg")}>{t.v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {d.topCategory && (
              <p className="text-[13px] text-fg-2">
                Most spent on <span className="font-semibold text-fg">{d.topCategory.name}</span> · {d.topCategory.label}
              </p>
            )}
            {b && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-fg">{b.category}</span>
                  <span className={cn("shrink-0 font-medium", b.state === "over" ? "text-danger" : b.state === "warn" ? "text-warning-text" : "text-fg-2")}>
                    {b.spentLabel} of {b.limitLabel}
                  </span>
                </div>
                <Progress value={b.percent} color={b.state === "over" ? "var(--danger)" : b.state === "warn" ? "var(--warning-fill)" : "var(--success)"} />
                {b.state !== "ok" && <p className={cn("mt-1 text-[12px] font-medium", b.state === "over" ? "text-danger" : "text-warning-text")}>{b.state === "over" ? "Over budget" : "Close to the limit"}</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <WidgetEmpty>Log what comes in and goes out this month, and see where it all goes.</WidgetEmpty>
      )}
    </WidgetCard>
  );
}
