"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyedMutator } from "swr";
import { ArrowRight, BookOpen, CalendarRange, Check, Heart, Image as ImageIcon, ListPlus, NotebookPen, Smile, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, Kbd } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb } from "@/components/media/media";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { openQuickCapture } from "@/lib/ui-store";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { MOODS, moodMeta, type Mood } from "@/lib/moods";
import { scoreWord } from "@/lib/mood";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";

type Props = { data: DashboardData; mutate: KeyedMutator<DashboardData> };

export function WidgetCard({ icon: Icon, title, action, children, className }: { icon: typeof Smile; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex h-full min-w-0 flex-col p-4 md:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon className="h-4 w-4 text-primary" aria-hidden /> {title}
        </h2>
        {action}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </Card>
  );
}

const MoreLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">
    {children} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
  </Link>
);

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// ------------------------------------------------------------------ mood

export function MoodCheckinWidget({ data, mutate }: Props) {
  const today = data.mood.today;
  const [busy, setBusy] = useState<Mood | null>(null);
  const [again, setAgain] = useState(false);
  const router = useRouter();

  async function log(mood: Mood) {
    setBusy(mood);
    try {
      const { item } = await api.post<{ item: { id: string; mood: Mood; intensity: number; loggedAt: string } }>("/api/mood", { mood, intensity: 3 });
      await mutate(
        { ...data, mood: { ...data.mood, today: { id: item.id, mood: item.mood, intensity: item.intensity, loggedAt: item.loggedAt, count: (today?.count ?? 0) + 1 } } },
        { revalidate: false },
      );
      toast.success(`Logged: feeling ${moodMeta(mood)?.label.toLowerCase()}`, { action: { label: "Add details", onClick: () => router.push("/mood") } });
      setAgain(false);
      refresh("/api/mood", "/api/dashboard", "/api/weekly-review", ...SUMMARY_KEYS);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  const m = moodMeta(today?.mood);
  return (
    <WidgetCard icon={Smile} title="How are you feeling?" action={<MoreLink href="/mood">Mood</MoreLink>}>
      {today && m && !again ? (
        <div className="flex flex-1 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[32px]" style={{ background: `color-mix(in oklab, ${m.color} 24%, var(--surface))` }} aria-hidden>
            {m.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[18px] font-semibold text-fg">Feeling {m.label.toLowerCase()}</p>
            <p className="text-[12.5px] text-fg-3">
              Checked in at {timeFmt.format(new Date(today.loggedAt))}
              {today.count > 1 ? ` · ${today.count} check-ins today` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAgain(true)}>
            Check in again
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-fg-3">Tap the one closest to how you feel right now.</p>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Log your mood">
            {MOODS.map((x) => (
              <button
                key={x.value}
                type="button"
                disabled={!!busy}
                onClick={() => void log(x.value)}
                aria-label={x.label}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[12px] border border-line bg-surface transition-colors outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/25 disabled:opacity-60",
                  busy === x.value && "border-primary",
                )}
              >
                <span className="text-[24px] leading-none" aria-hidden>
                  {x.emoji}
                </span>
                <span className="text-[11px] font-medium text-fg-2">{x.label}</span>
              </button>
            ))}
          </div>
          {again && (
            <button type="button" onClick={() => setAgain(false)} className="mt-2 self-start text-[12.5px] font-medium text-fg-2 hover:text-fg hover:underline">
              Cancel
            </button>
          )}
        </>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ journal

export function QuickJournalWidget({ data }: Props) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const { entry } = await api.post<{ entry: { id: string } }>("/api/dashboard/journal", { content: text });
      setText("");
      setSaved(entry.id);
      toast.success("Saved to your journal");
      refresh("/api/journal", "/api/dashboard", "/api/weekly-review", ...SUMMARY_KEYS);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WidgetCard icon={NotebookPen} title="Quick journal" action={<MoreLink href="/journal">Journal</MoreLink>}>
      <Textarea
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
        aria-label="What's on your mind today?"
        maxLength={20000}
        className="min-h-[96px] flex-1 resize-none"
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-fg-3">
          {saved ? (
            <Link href={`/journal?id=${saved}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Check className="h-3.5 w-3.5" /> Saved · Open in Journal
            </Link>
          ) : data.journal.todayCount ? (
            `${data.journal.todayCount} ${data.journal.todayCount === 1 ? "entry" : "entries"} today`
          ) : (
            "Saved as today's entry"
          )}
        </span>
        <Button size="sm" onClick={() => void save()} loading={saving} disabled={!text.trim()}>
          Save entry
        </Button>
      </div>
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ gratitude

export function GratitudeWidget({ data }: Props) {
  const g = data.gratitude;
  return (
    <WidgetCard icon={Heart} title="Gratitude" action={g.streak >= 2 ? <span className="text-[12px] font-medium text-fg-2">{g.streak}-day streak</span> : undefined}>
      {g.today ? (
        <>
          <ol className="flex flex-1 flex-col gap-2">
            {g.today.items.map((it, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-fg">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-[11px] font-semibold text-success">{i + 1}</span>
                <span className="min-w-0">{it}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <MoreLink href="/gratitude">See gratitude</MoreLink>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-[13.5px] leading-relaxed text-fg-2">Three small good things from today — a warm cup, a kind word, a quiet moment.</p>
          <Link href="/gratitude" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13.5px] font-medium text-on-primary hover:bg-primary-hover">
            <Sparkles className="h-4 w-4" /> Add today&apos;s gratitude
          </Link>
        </div>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ memories

export function RecentMemoriesWidget({ data }: Props) {
  return (
    <WidgetCard icon={ImageIcon} title="Recent memories" action={<MoreLink href="/memories">All memories</MoreLink>}>
      {data.memories.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.memories.map((m) => (
            <li key={m.id} className="min-w-0">
              <Link href={`/memories?id=${m.id}`} className="group block rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
                {m.cover ? (
                  <MediaThumb media={m.cover} alt={m.title} className="aspect-[4/3] rounded-[12px]" />
                ) : (
                  <span className="flex aspect-[4/3] w-full items-center justify-center rounded-[12px] bg-surface-2 text-fg-3">
                    <ImageIcon className="h-6 w-6" aria-hidden />
                  </span>
                )}
                <span className="mt-1.5 block truncate text-[13.5px] font-medium text-fg group-hover:underline">{m.title}</span>
                <span className="block text-[12px] text-fg-3">{m.dateLabel}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] leading-relaxed text-fg-2">Moments worth keeping will show up here — a trip, a dinner, an ordinary good day.</p>
          <Link href="/memories" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-line px-3.5 text-[13.5px] font-medium text-fg hover:bg-surface-2">
            <ImageIcon className="h-4 w-4" /> Save a memory
          </Link>
        </div>
      )}
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ this week

export function WeekSummaryWidget({ data }: Props) {
  const w = data.week;
  const dom = moodMeta(w.moodDominant);
  const tiles = [
    { label: "Tasks done", value: String(w.tasksDone) },
    { label: "Habits", value: w.habitRate != null ? `${w.habitRate}%` : "—" },
    { label: "Mood", value: w.moodAvg != null ? `${dom ? `${dom.emoji} ` : ""}${scoreWord(w.moodAvg)}` : "—" },
    { label: "Journal days", value: `${w.journalDays}/${w.elapsed}` },
  ];
  return (
    <WidgetCard icon={CalendarRange} title="This week" action={<MoreLink href="/weekly-review">Weekly review</MoreLink>}>
      <p className="-mt-1 mb-3 text-[12px] text-fg-3">{w.label}</p>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
            <div className="text-[12px] font-medium text-fg-2">{t.label}</div>
            <div className="font-display mt-0.5 text-[20px] leading-tight font-semibold text-fg tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

// ------------------------------------------------------------------ quick actions

export function QuickActionsWidget({ data }: Props) {
  const linkCls =
    "inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-[13.5px] font-medium text-fg transition-colors hover:bg-surface-2 outline-none focus-visible:ring-3 focus-visible:ring-primary/25";
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
      <button type="button" className={linkCls} onClick={() => openTaskDialog({ dueDate: data.today.key })}>
        <ListPlus className="h-4 w-4 text-primary" aria-hidden /> New task
      </button>
      <Link href="/journal" className={linkCls}>
        <BookOpen className="h-4 w-4 text-primary" aria-hidden /> Journal
      </Link>
      <Link href="/mood" className={linkCls}>
        <Smile className="h-4 w-4 text-primary" aria-hidden /> Mood
      </Link>
      <Link href="/memories" className={linkCls}>
        <ImageIcon className="h-4 w-4 text-primary" aria-hidden /> Memory
      </Link>
      <Link href="/gratitude" className={linkCls}>
        <Heart className="h-4 w-4 text-primary" aria-hidden /> Gratitude
      </Link>
      <button type="button" className={linkCls} onClick={() => openQuickCapture()}>
        <Zap className="h-4 w-4 text-primary" aria-hidden /> Quick capture
        <span className="hidden sm:inline-flex">
          <Kbd>⌘K</Kbd>
        </span>
      </button>
    </div>
  );
}
