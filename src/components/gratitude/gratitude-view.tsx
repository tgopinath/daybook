"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CloudOff, Flame, Heart, Loader2, Sparkles, Trash2, Trophy } from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS } from "@/lib/client";
import { addDaysKey, dayKey, weekdayOfKey } from "@/lib/time";
import { promptForDay } from "@/lib/gratitude";
import { useMe, useTz } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, DemoBadge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Entry = { id: string; date: string; items: string[]; prompt: string | null; note: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
type DayRes = { date: string; prompt: string; item: Entry | null };
type ListRes = { items: Entry[]; nextCursor: string | null };
type Summary = {
  range: "week" | "month";
  offset: number;
  from: string;
  to: string;
  today: string;
  daysFilled: number;
  totalDays: number;
  elapsedDays: number;
  itemsCount: number;
  streak: { current: number; best: number };
  topWords: { word: string; count: number }[];
  items: { date: string; text: string }[];
  totalEntries: number;
};
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const KEYS = ["/api/gratitude", ...SUMMARY_KEYS];
const HEATMAP_WEEKS = 18;

function keyDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}
const fmt = (key: string, o: Intl.DateTimeFormatOptions) => keyDate(key).toLocaleDateString(undefined, { ...o, timeZone: "UTC" });

export function GratitudeView() {
  const router = useRouter();
  const params = useSearchParams();
  const tz = useTz();
  const today = dayKey(new Date(), tz);
  const paramDate = params.get("date");
  const date = paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) && paramDate <= today ? paramDate : today;

  const go = (d: string) => {
    router.replace(d === today ? "/gratitude" : `/gratitude?date=${d}`, { scroll: false });
    if (typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="pb-6">
      <div className="mb-6">
        <h1 className="font-display text-[26px] leading-tight font-semibold">Gratitude</h1>
        <p className="mt-1 text-sm text-fg-2">Three small good things, every day.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <DayCard key={date} date={date} today={today} onGo={go} />
          <SummaryCard />
          <History onOpen={go} current={date} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <StreakCard today={today} onOpen={go} selected={date} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the day's entry

function DayCard({ date, today, onGo }: { date: string; today: string; onGo: (d: string) => void }) {
  const { data, error } = useApi<DayRes>(`/api/gratitude/${date}`, { revalidateOnFocus: false });
  const title = date === today ? "Today" : date === addDaysKey(today, -1) ? "Yesterday" : fmt(date, { weekday: "long" });
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] leading-tight font-semibold">{title}</h2>
          <p className="text-[12.5px] text-fg-3">{fmt(date, { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onGo(addDaysKey(date, -1))} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <label>
            <span className="sr-only">Pick a day</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && e.target.value <= today && onGo(e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] text-fg-2 outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            />
          </label>
          <Button variant="ghost" size="icon-sm" onClick={() => onGo(addDaysKey(date, 1))} disabled={date >= today} aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {date !== today && (
            <Button variant="outline" size="sm" onClick={() => onGo(today)}>
              Today
            </Button>
          )}
        </div>
      </div>
      {error && !data ? (
        <p className="text-sm text-danger">Couldn&apos;t load this day. {error.message}</p>
      ) : !data || data.date !== date ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : (
        <DayForm date={date} prompt={data.prompt} entry={data.item} />
      )}
    </Card>
  );
}

function DayForm({ date, prompt, entry }: { date: string; prompt: string; entry: Entry | null }) {
  const [items, setItems] = useState<string[]>(() => [0, 1, 2].map((i) => entry?.items[i] ?? ""));
  const [note, setNote] = useState(entry?.note ?? "");
  const [showNote, setShowNote] = useState(!!entry?.note);
  const [state, setState] = useState<SaveState>("idle");
  const [exists, setExists] = useState(!!entry);
  const latest = useRef({ items, note });
  latest.current = { items, note };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const url = `/api/gratitude/${date}`;

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const payload = { items: latest.current.items, note: latest.current.note || null };
    setState("saving");
    chain.current = chain.current.then(async () => {
      try {
        const res = await api.put<{ item: Entry | null; streak: { current: number; best: number } }>(url, payload);
        setExists(!!res.item);
        setState("saved");
        refresh(...KEYS);
      } catch (err) {
        dirty.current = true;
        setState("error");
        toastError(err);
      }
    });
  }, [url]);

  const queue = () => {
    dirty.current = true;
    setState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  };

  // Save outstanding edits when switching days or leaving.
  useEffect(() => {
    const onHide = () => {
      if (!dirty.current) return;
      void fetch(url, { method: "PUT", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ items: latest.current.items, note: latest.current.note || null }) });
      dirty.current = false;
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      save();
    };
  }, [save, url]);

  const clear = async () => {
    const ok = await confirm({ title: "Clear this day?", body: "Your gratitude entry for this day will be permanently deleted.", destructive: true, confirmLabel: "Clear day" });
    if (!ok) return;
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    try {
      await chain.current;
      await api.delete(url);
      setItems(["", "", ""]);
      setNote("");
      setShowNote(false);
      setExists(false);
      setState("idle");
      refresh(...KEYS);
      toast.success("Day cleared");
    } catch (err) {
      toastError(err);
    }
  };

  const filled = items.filter((s) => s.trim()).length;

  return (
    <div>
      <p className="font-display mb-4 flex items-start gap-2 text-[17px] leading-snug text-fg-2 italic">
        <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
        {prompt || promptForDay(date)}
      </p>
      <ol className="flex flex-col gap-2.5">
        {items.map((v, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              aria-hidden
              className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold", v.trim() ? "bg-primary text-on-primary" : "bg-surface-2 text-fg-2")}
            >
              {i + 1}
            </span>
            <input
              value={v}
              maxLength={500}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                setItems(next);
                queue();
              }}
              onBlur={save}
              placeholder="I'm grateful for…"
              aria-label={`Gratitude ${i + 1}`}
              className="h-11 w-full min-w-0 rounded-[10px] border border-line bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-fg-3 focus:border-primary focus:ring-3 focus:ring-primary/15"
            />
          </li>
        ))}
      </ol>
      {showNote ? (
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Note</span>
          <Textarea
            value={note}
            maxLength={5000}
            onChange={(e) => {
              setNote(e.target.value);
              queue();
            }}
            onBlur={save}
            placeholder="Anything else about today you'd like to remember?"
            className="min-h-[90px] text-[14px]"
          />
        </label>
      ) : (
        <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={() => setShowNote(true)}>
          + Add a note
        </Button>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <SaveIndicator state={state} filled={filled} />
        <DemoBadge show={entry?.isDemo} />
        {exists && (
          <Button variant="ghost" size="sm" className="ml-auto text-danger hover:text-danger" onClick={clear}>
            <Trash2 className="h-3.5 w-3.5" /> Clear day
          </Button>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state, filled }: { state: SaveState; filled: number }) {
  const base = "flex items-center gap-1.5 text-[12.5px] text-fg-3";
  if (state === "pending" || state === "saving")
    return (
      <span className={base} aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  if (state === "error")
    return (
      <span className={cn(base, "text-danger")} aria-live="polite">
        <CloudOff className="h-3.5 w-3.5" /> Not saved
      </span>
    );
  if (state === "saved")
    return (
      <span className={base} aria-live="polite">
        <Check className="h-3.5 w-3.5 text-success" /> Saved{filled === 3 ? " · all three, lovely" : ""}
      </span>
    );
  return <span className={base}>{filled ? `${filled} of 3 written` : "Saves automatically as you type"}</span>;
}

// ------------------------------------------------------------------ streak + heatmap

function StreakCard({ today, onOpen, selected }: { today: string; onOpen: (d: string) => void; selected: string }) {
  const { data: me } = useMe();
  const weekStart = me?.settings.weekStart ?? 1;
  const lastCol = addDaysKey(today, (weekStart + 6 - weekdayOfKey(today)) % 7); // end of this week
  const first = addDaysKey(lastCol, -(HEATMAP_WEEKS * 7 - 1));
  const { data: list, isLoading } = useApi<ListRes>(`/api/gratitude?from=${first}&to=${today}&limit=400`);
  const { data: sum } = useApi<Summary>("/api/gratitude/summary?range=week");
  const counts = useMemo(() => new Map((list?.items ?? []).map((e) => [e.date, e.items.filter((s) => s.trim()).length])), [list]);
  const weeks = useMemo(() => Array.from({ length: HEATMAP_WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysKey(first, w * 7 + d))), [first]);
  const filledDays = [...counts.values()].filter((n) => n > 0).length;

  return (
    <Card className="p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[12px] bg-primary-soft p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
            <Flame className="h-4 w-4 text-primary" aria-hidden /> Current streak
          </p>
          <p className="font-display mt-1 text-[30px] leading-none font-semibold">
            {sum ? sum.streak.current : "–"}
            <span className="ml-1 font-sans text-[13px] font-normal text-fg-2">{sum?.streak.current === 1 ? "day" : "days"}</span>
          </p>
        </div>
        <div className="rounded-[12px] bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
            <Trophy className="h-4 w-4 text-warning" aria-hidden /> Best streak
          </p>
          <p className="font-display mt-1 text-[30px] leading-none font-semibold">
            {sum ? sum.streak.best : "–"}
            <span className="ml-1 font-sans text-[13px] font-normal text-fg-2">{sum?.streak.best === 1 ? "day" : "days"}</span>
          </p>
        </div>
      </div>
      {sum && sum.streak.current > 0 && !counts.get(today) && <p className="mt-3 text-[12.5px] text-fg-2">Fill in today to keep your streak going.</p>}

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[14px] font-semibold">Last {HEATMAP_WEEKS} weeks</h3>
          <span className="text-[12px] text-fg-3">{filledDays} days filled</span>
        </div>
        {isLoading && !list ? (
          <Skeleton className="h-[120px] w-full" />
        ) : (
          <div className="flex gap-[3px] overflow-x-auto pb-1 scroll-thin" role="grid" aria-label="Days with gratitude entries">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]" role="row">
                {week.map((d) => {
                  const n = counts.get(d) ?? 0;
                  const future = d > today;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="gridcell"
                      disabled={future}
                      onClick={() => onOpen(d)}
                      aria-label={`${fmt(d, { month: "short", day: "numeric" })}: ${n ? `${n} ${n === 1 ? "item" : "items"}` : "empty"}`}
                      title={`${fmt(d, { month: "short", day: "numeric" })}${n ? ` · ${n}` : ""}`}
                      className={cn(
                        "h-[14px] w-[14px] shrink-0 rounded-[3px] border",
                        future ? "invisible" : n ? "border-transparent" : "border-line bg-surface-2",
                        d === selected && "ring-2 ring-fg ring-offset-1 ring-offset-surface",
                      )}
                      style={n ? { background: `color-mix(in oklab, var(--primary) ${n === 1 ? 45 : n === 2 ? 72 : 100}%, var(--surface))` } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-end gap-1 text-[11.5px] text-fg-3">
          Less
          <span className="h-[10px] w-[10px] rounded-[2px] border border-line bg-surface-2" />
          {[45, 72, 100].map((p) => (
            <span key={p} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: `color-mix(in oklab, var(--primary) ${p}%, var(--surface))` }} />
          ))}
          More
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ summaries

function SummaryCard() {
  const [range, setRange] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useApi<Summary>(`/api/gratitude/summary?range=${range}&offset=${offset}`);
  const label =
    range === "week"
      ? offset === 0
        ? "This week"
        : offset === -1
          ? "Last week"
          : data
            ? `${fmt(data.from, { month: "short", day: "numeric" })} – ${fmt(data.to, { month: "short", day: "numeric" })}`
            : "…"
      : offset === 0
        ? "This month"
        : data
          ? fmt(data.from, { month: "long", year: "numeric" })
          : "…";
  const maxWord = data?.topWords[0]?.count ?? 1;

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display flex-1 text-[18px] font-semibold">{label}</h2>
        <Segmented
          size="sm"
          value={range}
          onChange={(r) => {
            setRange(r);
            setOffset(0);
          }}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
        <div className="flex">
          <Button variant="ghost" size="icon-sm" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${range}`}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label={`Next ${range}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {isLoading && !data ? (
        <div className="grid grid-cols-3 gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Days filled" value={`${data.daysFilled}`} sub={`of ${offset === 0 ? data.elapsedDays : data.totalDays}`} />
            <Stat label="Things noted" value={`${data.itemsCount}`} />
            <Stat label="Streak" value={`${data.streak.current}`} sub={data.streak.current === 1 ? "day" : "days"} />
          </div>
          {data.topWords.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-[13px] font-semibold text-fg-2">What came up most</h3>
              <ul className="flex flex-wrap gap-1.5">
                {data.topWords.map((w) => (
                  <li
                    key={w.word}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-fg"
                    style={{ fontSize: `${12.5 + (w.count / maxWord) * 3}px` }}
                  >
                    {w.word}
                    <span className="text-[11.5px] text-fg-3 tabular-nums">{w.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5">
            <h3 className="mb-2 text-[13px] font-semibold text-fg-2">
              {range === "week" ? (offset === 0 ? "This week" : "That week") : offset === 0 ? "This month" : "That month"} you were grateful for…
            </h3>
            {data.items.length ? (
              <ul className="flex flex-col gap-1.5">
                {data.items.slice(0, range === "week" ? 21 : 30).map((it, i) => (
                  <li key={`${it.date}-${i}`} className="flex gap-2 text-[14px] leading-snug">
                    <Heart className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">{it.text}</span>
                    <span className="shrink-0 text-[12px] text-fg-3">{fmt(it.date, { weekday: "short", ...(range === "month" ? { day: "numeric" } : {}) })}</span>
                  </li>
                ))}
                {data.items.length > (range === "week" ? 21 : 30) && <li className="text-[12.5px] text-fg-3">and {data.items.length - (range === "week" ? 21 : 30)} more</li>}
              </ul>
            ) : (
              <p className="text-[14px] text-fg-2">Nothing yet. Even one small thing counts.</p>
            )}
          </div>
        </>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] bg-surface-2 px-3 py-2.5">
      <p className="text-[12px] text-fg-2">{label}</p>
      <p className="font-display mt-0.5 text-[24px] leading-none font-semibold">
        {value}
        {sub && <span className="ml-1 font-sans text-[12px] font-normal text-fg-2">{sub}</span>}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ history

function History({ onOpen, current }: { onOpen: (d: string) => void; current: string }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  return (
    <section aria-labelledby="gratitude-history">
      <h2 id="gratitude-history" className="font-display mb-3 text-[18px] font-semibold">
        History
      </h2>
      <ul className="flex flex-col gap-2">
        {cursors.map((c, i) => (
          <HistoryPage
            key={c ?? "first"}
            cursor={c}
            first={i === 0}
            last={i === cursors.length - 1}
            current={current}
            onOpen={onOpen}
            onMore={(n) => setCursors((cs) => (cs.includes(n) ? cs : [...cs, n]))}
          />
        ))}
      </ul>
    </section>
  );
}

function HistoryPage({ cursor, first, last, current, onOpen, onMore }: { cursor: string | null; first: boolean; last: boolean; current: string; onOpen: (d: string) => void; onMore: (c: string) => void }) {
  const { data, error, isLoading } = useApi<ListRes>(`/api/gratitude${cursor ? `?cursor=${cursor}` : ""}`);
  if (error && !data) return <li className="text-sm text-danger">Couldn&apos;t load history. {error.message}</li>;
  if (isLoading && !data)
    return (
      <li className="flex flex-col gap-2" aria-busy="true" aria-label="Loading history">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </li>
    );
  if (!data) return null;
  if (first && !data.items.length)
    return (
      <li>
        <Card>
          <EmptyState icon={Heart} title="Your gratitude story begins today" description="Write down three good things above. They'll gather here, day by day." className="py-10" />
        </Card>
      </li>
    );
  return (
    <>
      {data.items.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => onOpen(e.date)}
            aria-current={current === e.date}
            className={cn("w-full rounded-[14px] border bg-surface p-4 text-left shadow-card transition-colors hover:border-primary", current === e.date ? "border-primary" : "border-line")}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[14px] font-semibold">{fmt(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
              <DemoBadge show={e.isDemo} />
            </div>
            <ul className="flex flex-col gap-1">
              {e.items
                .filter((s) => s.trim())
                .map((s, i) => (
                  <li key={i} className="flex gap-2 text-[14px] leading-snug text-fg">
                    <Heart className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    {s}
                  </li>
                ))}
            </ul>
            {e.note && <p className="mt-2 line-clamp-2 text-[13px] text-fg-2">{e.note}</p>}
          </button>
        </li>
      ))}
      {last && data.nextCursor && (
        <li className="text-center">
          <Button variant="outline" size="sm" onClick={() => onMore(data.nextCursor!)}>
            Load more
          </Button>
        </li>
      )}
    </>
  );
}
