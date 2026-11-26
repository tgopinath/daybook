"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, RotateCw, Smile } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { MOODS, moodMeta, type Mood } from "@/lib/moods";
import { cn } from "@/lib/utils";
import type { Common } from "./widgets";
import type { FocusSection, MoodSection, UpcomingSection } from "./types";
import { TodayFocus, TodayFocusSkeleton } from "./today-focus";
import { Upcoming, UpcomingSkeleton } from "./upcoming";
import { secondaryActionCls } from "./widget-card";

/** Card-level failure for one part of the page: one gentle line and a retry. */
export function SectionError({ title, onRetry, className }: { title: string; onRetry: () => void; className?: string }) {
  return (
    <Card className={cn("flex flex-col items-start gap-2.5 p-4 md:p-5", className)} role="alert">
      <h3 className="font-display text-[17px] font-semibold text-fg">{title}</h3>
      <p className="text-[13px] text-fg-2">Couldn&apos;t load this right now.</p>
      <button type="button" onClick={onRetry} className={secondaryActionCls}>
        <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
      </button>
    </Card>
  );
}

type Slot<T> = { data: T | null | undefined; loading: boolean; onRetry: () => void };

/** Today: focus as the main card; mood check-in and the next seven days beside it (below on phones). */
export function TodaySection({
  todayKey,
  focus,
  mood,
  upcoming,
  patch,
}: {
  todayKey: string;
  focus: Slot<FocusSection>;
  mood: Slot<MoodSection>;
  upcoming: Slot<UpcomingSection>;
  patch: Common["patch"];
}) {
  const view = <T,>(s: Slot<T>, title: string, skeleton: ReactNode, render: (d: T) => ReactNode) =>
    s.loading && s.data === undefined ? skeleton : s.data ? render(s.data) : <SectionError title={title} onRetry={s.onRetry} />;

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        {view(focus, "Today's Focus", <TodayFocusSkeleton />, (d) => (
          <TodayFocus data={d} todayKey={todayKey} patch={(fn) => patch("focus", fn)} />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-4 md:gap-5">
        {view(mood, "How are you feeling?", <MoodSkeleton />, (d) => (
          <MoodCheckin data={d} todayKey={todayKey} patch={(fn) => patch("mood", fn)} />
        ))}
        {view(upcoming, "Upcoming", <UpcomingSkeleton />, (d) => (
          <Upcoming days={d.days} />
        ))}
      </div>
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** The one mood check-in on the page: an inline emoji row, today's mood with "Check in again", and the last seven days. */
export function MoodCheckin({ data, todayKey, patch }: { data: MoodSection; todayKey: string; patch: (fn: (s: MoodSection) => MoodSection) => void }) {
  const [busy, setBusy] = useState<Mood | null>(null);
  const [again, setAgain] = useState(false);
  const today = data.today;
  const m = moodMeta(today?.mood);

  async function log(mood: Mood) {
    setBusy(mood);
    try {
      const { item } = await api.post<{ item: { id: string; mood: Mood; loggedAt: string } }>("/api/mood", { mood, intensity: 3 });
      const prev = data.today;
      patch((s) => ({
        ...s,
        today: { id: item.id, mood: item.mood, loggedAt: item.loggedAt, count: (s.today?.count ?? 0) + 1 },
        week: s.week.map((w) => (w.day === todayKey ? { ...w, mood } : w)),
      }));
      setAgain(false);
      toast.undo(`Logged: feeling ${moodMeta(mood)?.label.toLowerCase()}`, async () => {
        try {
          await api.delete(`/api/mood/${item.id}`);
          patch((s) => ({ ...s, today: prev, week: s.week.map((w) => (w.day === todayKey ? { ...w, mood: prev?.mood ?? null } : w)) }));
        } catch (err) {
          toastError(err);
        } finally {
          refresh("/api/mood", "/api/weekly-review", ...SUMMARY_KEYS);
        }
      });
      refresh("/api/mood", "/api/weekly-review", ...SUMMARY_KEYS);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="today-mood" className="flex min-w-0 flex-col p-4 md:p-5" role="region" aria-labelledby="today-mood-title">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="today-mood-title" className="font-display flex items-center gap-2 text-[17px] font-semibold">
            <Smile className="h-4 w-4 text-primary" aria-hidden /> How are you feeling?
          </h3>
          <p className="mt-0.5 text-[12.5px] text-fg-2">
            {m ? (data.streak >= 2 ? `${data.streak}-day check-in streak` : "Thanks for checking in") : "Tap the one closest to how you feel right now."}
          </p>
        </div>
        <Link href="/mood" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-primary hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
          Mood <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">tracker: add details</span>
        </Link>
      </div>

      {today && m && !again ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[28px]" style={{ background: `color-mix(in oklab, ${m.color} 24%, var(--surface))` }} aria-hidden>
            {m.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-semibold text-fg">Feeling {m.label.toLowerCase()}</p>
            <p className="text-[12px] text-fg-2">
              Checked in at {timeFmt.format(new Date(today.loggedAt))}
              {today.count > 1 ? ` · ${today.count} check-ins today` : ""}
            </p>
          </div>
          <button type="button" className={secondaryActionCls} onClick={() => setAgain(true)}>
            Check in again
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Log your mood">
            {MOODS.map((x) => (
              <button
                key={x.value}
                type="button"
                disabled={!!busy}
                onClick={() => void log(x.value)}
                aria-label={x.label}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[12px] border border-line bg-surface outline-none transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/30 disabled:cursor-wait",
                  busy === x.value && "border-primary",
                )}
              >
                <span className="text-[22px] leading-none" aria-hidden>
                  {x.emoji}
                </span>
                <span className="text-[11px] font-medium text-fg-2">{x.label}</span>
              </button>
            ))}
          </div>
          {again && (
            <button type="button" onClick={() => setAgain(false)} className="mt-2 min-h-9 self-start text-[12.5px] font-medium text-fg-2 hover:text-fg hover:underline">
              Cancel
            </button>
          )}
        </>
      )}

      <ul className="mt-3 flex justify-between gap-1" aria-label="Last seven days">
        {data.week.map((w) => {
          const wm = moodMeta(w.mood);
          return (
            <li key={w.day} className="flex flex-1 flex-col items-center gap-0.5" title={`${w.label}: ${wm ? wm.label : "no check-in"}`}>
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[15px]", !wm && "bg-surface-2")} aria-hidden>
                {wm?.emoji ?? ""}
              </span>
              <span className="text-[10.5px] font-medium text-fg-2" aria-hidden>
                {w.label === "Today" ? "Today" : w.label.slice(0, 3)}
              </span>
              <span className="sr-only">
                {w.label}: {wm ? wm.label : "no check-in"}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MoodSkeleton() {
  return (
    <Card className="p-4 md:p-5" aria-busy="true" aria-label="Loading mood">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-[12px]" />
        ))}
      </div>
    </Card>
  );
}
