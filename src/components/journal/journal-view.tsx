"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { BookOpen, CalendarDays, Camera, History, List as ListIcon, Lock, PenLine, Pin, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { api, refresh, useApi } from "@/lib/client";
import { dayKey } from "@/lib/time";
import { MOODS, moodMeta } from "@/lib/moods";
import { useTz } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, DemoBadge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { JournalEditor, JOURNAL_KEYS } from "./journal-editor";
import { JournalCalendar } from "./journal-calendar";
import type { JournalFull, JournalListItem, JournalMeta, JournalPage } from "./types";

type Status = "all" | "drafts" | "private" | "pinned";
type Mode = "list" | "calendar";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

function keyDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}
const fmt = (key: string, o: Intl.DateTimeFormatOptions) => keyDate(key).toLocaleDateString(undefined, { ...o, timeZone: "UTC" });

export function JournalView() {
  const router = useRouter();
  const params = useSearchParams();
  const tz = useTz();
  const today = dayKey(new Date(), tz);
  const selected = params.get("id");

  const [mode, setMode] = useState<Mode>("list");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [mood, setMood] = useState("");
  const [tag, setTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(params.get("date"));
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q.trim(), 250);
  const { data: meta } = useApi<JournalMeta>("/api/journal/meta");

  useEffect(() => {
    const d = params.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setMode("calendar");
      setDay(d);
      setMonth(d.slice(0, 7));
    }
  }, [params]);

  const select = (id: string | null) => {
    const sp = new URLSearchParams();
    if (id) sp.set("id", id);
    router.replace(sp.size ? `/journal?${sp}` : "/journal", { scroll: false });
  };

  const create = async (entryDate?: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await api.post<{ item: JournalFull }>("/api/journal", { entryDate: entryDate ?? today });
      refresh(...JOURNAL_KEYS);
      select(res.item.id);
    } catch (err) {
      toastError(err);
    } finally {
      setCreating(false);
    }
  };

  // `/journal?new=1` (dashboard / search quick actions) starts today's entry straight away.
  const handledNew = useRef(false);
  useEffect(() => {
    if (params.get("new") !== "1") handledNew.current = false; // ready for the next ?new=1 (the "New" menu)
    else if (!handledNew.current) {
      handledNew.current = true;
      void create();
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const listUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (mode === "calendar") {
      if (!day) return null;
      sp.set("from", day);
      sp.set("to", day);
      return `/api/journal?${sp}`;
    }
    if (dq) sp.set("q", dq);
    if (status !== "all") sp.set("status", status);
    if (mood) sp.set("mood", mood);
    if (tag) sp.set("tag", tag);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    return `/api/journal?${sp}`;
  }, [mode, day, dq, status, mood, tag, from, to]);

  const filterCount = [mood, tag, from || to].filter(Boolean).length;
  const filtered = !!(dq || status !== "all" || filterCount);
  const clearFilters = () => {
    setMood("");
    setTag("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="-mt-2 flex flex-col md:h-[calc(100dvh-8rem)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-semibold">Journal</h1>
          <p className="mt-0.5 text-sm text-fg-2">{meta ? `${meta.total} ${meta.total === 1 ? "entry" : "entries"}` : "Your private place to write"}</p>
        </div>
        <Button onClick={() => create()} loading={creating}>
          {!creating && <PenLine className="h-4 w-4" />} Write today&apos;s entry
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden md:rounded-[14px] md:border md:border-line md:bg-surface md:shadow-card">
        {/* List pane */}
        <aside className={cn("flex min-h-0 w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-line lg:w-[360px]", selected && "max-md:hidden")}>
          <div className="flex flex-col gap-2 pb-3 md:p-3">
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "list", label: "Entries", icon: ListIcon },
                { value: "calendar", label: "Calendar", icon: CalendarDays },
              ]}
            />
            {mode === "list" ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
                    <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your journal" aria-label="Search journal" className="pl-9" />
                  </div>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <Button variant="outline" size="icon" aria-label={`Filters${filterCount ? ` (${filterCount} active)` : ""}`} className="relative">
                        <SlidersHorizontal className="h-4 w-4" />
                        {filterCount > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">{filterCount}</span>
                        )}
                      </Button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content align="end" sideOffset={6} className="z-[60] w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-3 shadow-pop">
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="mb-1.5 text-[12.5px] font-medium text-fg-2">Mood</p>
                            <div className="flex flex-wrap gap-1">
                              {MOODS.map((m) => (
                                <button
                                  key={m.value}
                                  type="button"
                                  aria-pressed={mood === m.value}
                                  onClick={() => setMood(mood === m.value ? "" : m.value)}
                                  className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[12px]", mood === m.value ? "border-primary bg-primary-soft text-fg" : "border-line text-fg-2 hover:bg-surface-2")}
                                >
                                  <span aria-hidden>{m.emoji}</span> {m.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-medium text-fg-2">Tag</span>
                            <Select value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 text-[14px]">
                              <option value="">Any tag</option>
                              {meta?.tags.map((t) => (
                                <option key={t.id} value={t.id}>
                                  #{t.name} ({t.count})
                                </option>
                              ))}
                            </Select>
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[12.5px] font-medium text-fg-2">From</span>
                              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 px-2 text-[14px]" />
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[12.5px] font-medium text-fg-2">To</span>
                              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 px-2 text-[14px]" />
                            </label>
                          </div>
                          <div className="flex justify-between">
                            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!filterCount}>
                              Clear filters
                            </Button>
                            <Popover.Close asChild>
                              <Button size="sm">Done</Button>
                            </Popover.Close>
                          </div>
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
                <Segmented
                  size="sm"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: "All" },
                    { value: "pinned", label: "Pinned", icon: Pin },
                    { value: "private", label: "Private", icon: Lock, count: meta?.private || undefined },
                    { value: "drafts", label: "Drafts", count: meta?.drafts || undefined },
                  ]}
                />
                {filterCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    {mood && <Chip onClear={() => setMood("")}>{`${moodMeta(mood)?.emoji} ${moodMeta(mood)?.label}`}</Chip>}
                    {tag && <Chip onClear={() => setTag("")}>#{meta?.tags.find((t) => t.id === tag)?.name ?? "tag"}</Chip>}
                    {(from || to) && <Chip onClear={() => (setFrom(""), setTo(""))}>{`${from ? fmt(from, { month: "short", day: "numeric" }) : "…"} – ${to ? fmt(to, { month: "short", day: "numeric" }) : "…"}`}</Chip>}
                  </div>
                )}
              </>
            ) : (
              <JournalCalendar month={month} onMonth={setMonth} selected={day} onSelect={setDay} today={today} />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto md:px-2 md:pb-2 scroll-thin">
            {mode === "list" && !filtered && <OnThisDay today={today} onOpen={select} />}
            {mode === "calendar" && !day ? (
              <p className="px-3 py-6 text-center text-sm text-fg-2">Pick a day to see its entries.</p>
            ) : (
              <>
                {mode === "calendar" && day && (
                  <div className="flex items-center justify-between gap-2 px-1 pb-2 md:px-2">
                    <h3 className="text-[14px] font-semibold">{fmt(day, { weekday: "long", month: "long", day: "numeric" })}</h3>
                    {day <= today && (
                      <Button size="sm" variant="outline" onClick={() => create(day)} loading={creating}>
                        {!creating && <Plus className="h-3.5 w-3.5" />} Write
                      </Button>
                    )}
                  </div>
                )}
                {listUrl && (
                  <PagedList
                    key={listUrl}
                    baseUrl={listUrl}
                    selected={selected}
                    onOpen={select}
                    empty={
                      mode === "calendar" ? (
                        <p className="px-3 py-6 text-center text-sm text-fg-2">{day && day > today ? "This day hasn't happened yet." : "Nothing written on this day."}</p>
                      ) : filtered ? (
                        <EmptyState icon={Search} title="No matching entries" description="Try a different search or filter." className="py-10" />
                      ) : (
                        <EmptyState
                          icon={BookOpen}
                          title="Your story starts with a single line"
                          description="Write about your day, a feeling, or something you want to remember."
                          action={
                            <Button onClick={() => create()} loading={creating}>
                              {!creating && <PenLine className="h-4 w-4" />} Write today&apos;s entry
                            </Button>
                          }
                          className="py-10"
                        />
                      )
                    }
                  />
                )}
              </>
            )}
          </div>
        </aside>

        {/* Editor: full screen on mobile */}
        <section className={cn("min-h-0 min-w-0 flex-1", selected ? "max-md:fixed max-md:inset-0 max-md:z-[45] max-md:bg-surface" : "max-md:hidden")}>
          {selected ? (
            <JournalEditor id={selected} onClose={() => select(null)} />
          ) : (
            <EmptyState
              icon={PenLine}
              title="What's on your mind today?"
              description="Open an entry from the list, or start writing today's page."
              action={
                <Button variant="outline" onClick={() => create()} loading={creating}>
                  {!creating && <Plus className="h-4 w-4" />} New entry
                </Button>
              }
              className="h-full"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-2 text-fg-2">
      {children}
      <button type="button" onClick={onClear} className="rounded p-0.5 text-fg-3 hover:bg-line hover:text-fg" aria-label="Clear filter">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Pages are separate SWR keys under /api/journal so refresh("/api/journal") revalidates all of them. */
function PagedList({ baseUrl, selected, onOpen, empty }: { baseUrl: string; selected: string | null; onOpen: (id: string) => void; empty: React.ReactNode }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  return (
    <ul className="flex flex-col gap-1">
      {cursors.map((c, i) => (
        <ListPage
          key={c ?? "first"}
          url={c ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}cursor=${c}` : baseUrl}
          first={i === 0}
          last={i === cursors.length - 1}
          selected={selected}
          onOpen={onOpen}
          empty={empty}
          onMore={(next) => setCursors((cs) => (cs.includes(next) ? cs : [...cs, next]))}
        />
      ))}
    </ul>
  );
}

function ListPage({ url, first, last, selected, onOpen, empty, onMore }: { url: string; first: boolean; last: boolean; selected: string | null; onOpen: (id: string) => void; empty: React.ReactNode; onMore: (c: string) => void }) {
  const { data, error, isLoading } = useApi<JournalPage>(url);
  if (error && !data) return <li className="p-4 text-sm text-danger">Couldn&apos;t load entries. {error.message}</li>;
  if (isLoading && !data)
    return (
      <li className="flex flex-col gap-2 p-1" aria-busy="true" aria-label="Loading entries">
        {Array.from({ length: first ? 6 : 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full" />
        ))}
      </li>
    );
  if (!data) return null;
  if (first && !data.items.length) return <li>{empty}</li>;
  return (
    <>
      {data.items.map((e) => (
        <li key={e.id}>
          <EntryRow e={e} active={selected === e.id} onOpen={() => onOpen(e.id)} />
        </li>
      ))}
      {last && data.nextCursor && (
        <li className="p-2 text-center">
          <Button variant="outline" size="sm" onClick={() => onMore(data.nextCursor!)}>
            Load more
          </Button>
        </li>
      )}
    </>
  );
}

function EntryRow({ e, active, onOpen }: { e: JournalListItem; active: boolean; onOpen: () => void }) {
  const mood = moodMeta(e.mood);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active}
      className={cn(
        "flex w-full gap-3 rounded-[10px] border border-transparent px-3 py-2.5 text-left transition-colors",
        "max-md:border-line max-md:bg-surface",
        active ? "bg-primary-soft md:border-primary/30" : "hover:bg-surface-2",
      )}
    >
      <div className="flex w-10 shrink-0 flex-col items-center pt-0.5">
        <span className="text-[11px] font-medium text-fg-3 uppercase">{fmt(e.entryDate, { month: "short" })}</span>
        <span className="font-display text-[22px] leading-none font-semibold">{Number(e.entryDate.slice(8))}</span>
        <span className="mt-0.5 text-[11px] text-fg-3">{e.entryDate.slice(0, 4) !== String(new Date().getFullYear()) ? e.entryDate.slice(0, 4) : fmt(e.entryDate, { weekday: "short" })}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {e.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-primary" aria-label="Pinned" />}
          {e.isPrivate && <Lock className="h-3 w-3 shrink-0 text-fg-2" aria-label="Private" />}
          <span className="font-display min-w-0 flex-1 truncate text-[15px] font-semibold">{e.title || "Untitled"}</span>
          {mood && (
            <span title={mood.label} aria-label={`Mood: ${mood.label}`} className="shrink-0 text-[15px]">
              {mood.emoji}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[12.5px] leading-snug text-fg-2">
          {e.isPrivate ? <span className="italic">Private entry</span> : e.preview || <span className="text-fg-3">Nothing written yet</span>}
        </p>
        {(e.tags.length > 0 || e.isDraft || e.mediaCount > 0 || e.isDemo) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
            {e.isDraft && <Badge tone="warning" className="text-warning-text">Draft</Badge>}
            {e.mediaCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Camera className="h-3 w-3" aria-hidden /> {e.mediaCount}
                <span className="sr-only">attachments</span>
              </span>
            )}
            {e.tags.slice(0, 3).map((t) => (
              <span key={t.id}>#{t.name}</span>
            ))}
            {e.tags.length > 3 && <span>+{e.tags.length - 3}</span>}
            <DemoBadge show={e.isDemo} />
          </div>
        )}
      </div>
      {e.cover && <img src={e.cover.url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
    </button>
  );
}

function OnThisDay({ today, onOpen }: { today: string; onOpen: (id: string) => void }) {
  const { data } = useApi<{ items: JournalListItem[] }>(`/api/journal/on-this-day?date=${today}`);
  if (!data?.items.length) return null;
  const year = Number(today.slice(0, 4));
  return (
    <section aria-label="On this day" className="mb-3 px-1 md:px-1">
      <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-fg-2">
        <History className="h-3.5 w-3.5 text-primary" aria-hidden /> On this day
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1 scroll-thin">
        {data.items.map((e) => {
          const ago = year - Number(e.entryDate.slice(0, 4));
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpen(e.id)}
              className="flex w-[200px] shrink-0 flex-col gap-0.5 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-left hover:border-primary"
            >
              <span className="text-[11.5px] font-medium text-primary">
                {ago} {ago === 1 ? "year" : "years"} ago {moodMeta(e.mood)?.emoji ?? ""}
              </span>
              <span className="font-display truncate text-[14px] font-semibold">{e.title || "Untitled"}</span>
              <span className="line-clamp-1 text-[12px] text-fg-2">{e.isPrivate ? "Private entry" : e.preview || "No text"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
