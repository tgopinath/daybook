"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Hourglass, Images, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, refresh, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Card, DemoBadge, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb, MediaViewer } from "@/components/media/media";
import { cn } from "@/lib/utils";
import { TIMELINE_CATEGORIES, formatTimelineDate, timelineMeta, type TimelineCategory } from "./meta";
import { EventDialog, TIMELINE_KEYS, type EventInit } from "./event-dialog";
import type { RelatedEntry, TimelineEventDTO, TimelineResponse } from "./types";

const RELATED_KEY = "mydiary-timeline-related";

type Entry = { kind: "event"; key: string; dateKey: string; event: TimelineEventDTO } | { kind: "related"; key: string; dateKey: string; related: RelatedEntry };

export function TimelineView() {
  const [showRelated, setShowRelated] = useState(false);
  useEffect(() => {
    try {
      setShowRelated(localStorage.getItem(RELATED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleRelated = (v: boolean) => {
    setShowRelated(v);
    try {
      localStorage.setItem(RELATED_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const { data, error, isLoading, mutate } = useApi<TimelineResponse>(showRelated ? "/api/timeline?related=1" : "/api/timeline");
  const events = useMemo(() => data?.items ?? [], [data]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<"" | TimelineCategory>("");
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; item: TimelineEventDTO | null; init?: EventInit }>({ open: false, item: null });
  const [highlight, setHighlight] = useState<string | null>(null);

  const allYears = useMemo(() => {
    const ys = new Set(events.map((e) => e.dateKey.slice(0, 4)));
    for (const r of data?.related ?? []) ys.add(r.dateKey.slice(0, 4));
    return [...ys].sort();
  }, [events, data]);

  const entries = useMemo<Entry[]>(() => {
    const needle = q.trim().toLowerCase();
    const inRange = (k: string) => (!fromYear || k.slice(0, 4) >= fromYear) && (!toYear || k.slice(0, 4) <= toYear);
    const list: Entry[] = events
      .filter((e) => (!category || e.category === category) && inRange(e.dateKey) && (!needle || e.title.toLowerCase().includes(needle) || (e.description ?? "").toLowerCase().includes(needle)))
      .map((e) => ({ kind: "event", key: `e:${e.id}`, dateKey: e.dateKey, event: e }));
    if (showRelated && !category)
      for (const r of data?.related ?? [])
        if (inRange(r.dateKey) && (!needle || r.title.toLowerCase().includes(needle))) list.push({ kind: "related", key: `${r.kind}:${r.id}`, dateKey: r.dateKey, related: r });
    return list.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [events, data, q, category, fromYear, toYear, showRelated]);

  const groups = useMemo(() => {
    const out: { year: string; entries: Entry[] }[] = [];
    for (const e of entries) {
      const y = e.dateKey.slice(0, 4);
      const last = out[out.length - 1];
      if (last?.year === y) last.entries.push(e);
      else out.push({ year: y, entries: [e] });
    }
    return out;
  }, [entries]);

  // Deep link: /timeline?id=… scrolls to and highlights that event; ?new=1 opens the add dialog.
  const deepId = params.get("id");
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (wantsNew) {
      setDialog({ open: true, item: null });
      router.replace(pathname, { scroll: false });
      return;
    }
    if (!deepId || !data) return;
    if (events.some((e) => e.id === deepId)) {
      setQ("");
      setCategory("");
      setFromYear("");
      setToYear("");
      setHighlight(deepId);
      setTimeout(() => document.getElementById(`event-${deepId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      setTimeout(() => setHighlight(null), 2600);
    } else toast.info("That moment isn't on your timeline any more");
    router.replace(pathname, { scroll: false });
  }, [deepId, wantsNew, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (e: TimelineEventDTO) => {
    setDialog((d) => ({ ...d, open: false }));
    mutate((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== e.id) } : d), { revalidate: false });
    try {
      await api.delete(`/api/timeline/${e.id}`);
      await refresh(...TIMELINE_KEYS);
      toast.undo(`"${e.title}" moved to Recently Deleted`, async () => {
        await api.patch(`/api/timeline/${e.id}`, { deletedAt: null }).catch(toastError);
        await refresh(...TIMELINE_KEYS);
      });
    } catch (err) {
      toastError(err);
      await mutate();
    }
  };

  const openNew = (init?: EventInit) => setDialog({ open: true, item: null, init: { ...init, ...(category && !init?.category ? { category } : {}) } });
  const openEdit = (item: TimelineEventDTO) => setDialog({ open: true, item });
  const filtersOn = !!q || !!category || !!fromYear || !!toYear;
  const jump = (y: string) => document.getElementById(`year-${y}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  let index = 0; // global alternation index for desktop left/right placement

  return (
    <div>
      <PageHeader
        title="Life Timeline"
        description="The chapters of your story, from the very beginning."
        actions={
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" /> Add moment
          </Button>
        }
      />

      {error && !data && <Card className="p-6 text-center text-[13.5px] text-danger">Couldn&apos;t load your timeline. {error.message}</Card>}
      {isLoading && !data && <TimelineSkeleton />}

      {data && events.length === 0 && !(showRelated && data.related?.length) && (
        <Card>
          <EmptyState
            icon={Hourglass}
            title="Your story starts here"
            description="Add the moments that shaped you — where you were born, your first job, the trip that changed everything."
            action={
              <Button onClick={() => openNew()}>
                <Plus className="h-4 w-4" /> Add your first moment
              </Button>
            }
          />
        </Card>
      )}

      {data && (events.length > 0 || (showRelated && !!data.related?.length)) && (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your story…" aria-label="Search timeline" className="pl-9" />
                {q && (
                  <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg" aria-label="Clear search">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select aria-label="From year" value={fromYear} onChange={(e) => setFromYear(e.target.value)} className="w-[110px]">
                <option value="">From</option>
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select aria-label="To year" value={toYear} onChange={(e) => setToYear(e.target.value)} className="w-[110px]">
                <option value="">To</option>
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <label className="flex h-9 items-center gap-2 rounded-[10px] px-1 text-[13px] text-fg-2">
                <Switch checked={showRelated} onChange={toggleRelated} label="Show memories and bucket list" />
                <span>Memories &amp; dreams</span>
              </label>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-thin" role="tablist" aria-label="Category">
              <Chip on={!category} onClick={() => setCategory("")}>
                All
              </Chip>
              {TIMELINE_CATEGORIES.map((c) => {
                const M = timelineMeta(c);
                return (
                  <Chip key={c} on={category === c} onClick={() => setCategory(c)} color={M.color}>
                    <M.icon className="h-3.5 w-3.5" style={{ color: M.color }} /> {c}
                  </Chip>
                );
              })}
            </div>
          </div>

          {groups.length > 1 && (
            <nav aria-label="Jump to year" className="sticky top-0 z-20 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-bg/95 px-1 py-2 backdrop-blur scroll-thin">
              {groups.map((g) => (
                <button key={g.year} type="button" onClick={() => jump(g.year)} className="h-7 shrink-0 rounded-full border border-line bg-surface px-2.5 text-[12px] font-medium text-fg-2 tabular-nums hover:border-line-strong hover:text-fg">
                  {g.year}
                </button>
              ))}
            </nav>
          )}

          {groups.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title="No moments match"
                description="Try another word, chapter or year range."
                action={
                  filtersOn ? (
                    <Button variant="outline" onClick={() => (setQ(""), setCategory(""), setFromYear(""), setToYear(""))}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="relative pb-6">
              <div className="absolute top-2 bottom-0 left-[15px] w-px bg-line-strong md:left-1/2" aria-hidden />
              {groups.map((g) => (
                <section key={g.year} aria-labelledby={`year-${g.year}`} className="relative">
                  <div className="relative flex items-center py-4 pl-10 md:justify-center md:pl-0">
                    <h2 id={`year-${g.year}`} className="relative z-[1] scroll-mt-16 rounded-full border border-line bg-surface px-4 py-1 font-display text-[20px] font-semibold tabular-nums shadow-card">
                      {g.year}
                    </h2>
                  </div>
                  <ol className="flex flex-col gap-4 md:gap-2">
                    {g.entries.map((e) => {
                      const side = index++ % 2 === 0 ? "left" : "right";
                      return (
                        <li key={e.key} className="relative">
                          {e.kind === "event" ? (
                            <EventItem event={e.event} side={side} highlight={highlight === e.event.id} onEdit={() => openEdit(e.event)} onDelete={() => remove(e.event)} />
                          ) : (
                            <RelatedItem entry={e.related} side={side} />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="relative flex py-2 pl-10 md:justify-center md:pl-0">
                    <button
                      type="button"
                      onClick={() => openNew({ year: Number(g.year) })}
                      className="relative z-[1] inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-line-strong bg-surface px-2.5 text-[12px] text-fg-3 transition-colors hover:border-primary hover:text-primary focus-visible:text-primary"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add a moment in {g.year}
                    </button>
                  </div>
                </section>
              ))}
              <div className="relative flex pt-4 pl-10 md:justify-center md:pl-0">
                <Button variant="outline" size="sm" onClick={() => openNew()} className="relative z-[1]">
                  <Plus className="h-3.5 w-3.5" /> What&apos;s next?
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <EventDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} item={dialog.item} init={dialog.init} onDelete={remove} />
    </div>
  );
}

// ------------------------------------------------------------------ items

function Dot({ color, small }: { color: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("absolute top-5 left-[15px] z-[1] -translate-x-1/2 rounded-full border-[3px] border-surface md:left-1/2", small ? "h-2.5 w-2.5 border-2" : "h-4 w-4")}
      style={{ background: color, boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 40%, transparent)` }}
    />
  );
}

const sideClass = (side: "left" | "right") => cn("pl-10 md:w-1/2", side === "left" ? "md:pr-8 md:pl-0" : "md:ml-auto md:pl-8");

function EventItem({ event, side, highlight, onEdit, onDelete }: { event: TimelineEventDTO; side: "left" | "right"; highlight: boolean; onEdit: () => void; onDelete: () => void }) {
  const M = timelineMeta(event.category);
  const [expanded, setExpanded] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = descRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [event.description]);
  const thumbs = event.media.slice(0, 4);
  const extra = event.media.length - thumbs.length;

  return (
    <>
      <Dot color={M.color} />
      <div className={sideClass(side)}>
        <motion.article
          id={`event-${event.id}`}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={cn("scroll-mt-24 rounded-[14px] border border-line bg-surface p-4 shadow-card transition-shadow", highlight && "ring-2 ring-primary ring-offset-2 ring-offset-bg")}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
                <span className="font-medium text-fg-2 tabular-nums">{formatTimelineDate(event.dateKey, event.datePrecision)}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <M.icon className="h-3.5 w-3.5" style={{ color: M.color }} /> {event.category}
                </span>
                <DemoBadge show={event.isDemo} />
              </div>
              <h3 className="mt-1 font-display text-[18px] leading-snug font-semibold">
                <button type="button" onClick={onEdit} className="text-left hover:underline focus-visible:underline">
                  {event.title}
                </button>
              </h3>
            </div>
            <Menu
              trigger={
                <button type="button" className="-mr-1 rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label={`More actions for ${event.title}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={[
                { label: "Edit", icon: Pencil, onSelect: onEdit },
                { type: "separator" },
                { label: "Delete", icon: Trash2, onSelect: onDelete, danger: true },
              ]}
            />
          </div>
          {event.description && (
            <>
              <p ref={descRef} className={cn("mt-1.5 text-[13.5px] leading-relaxed whitespace-pre-line text-fg-2", !expanded && "line-clamp-4")}>
                {event.description}
              </p>
              {(clamped || expanded) && (
                <button type="button" onClick={() => setExpanded((x) => !x)} className="mt-1 text-[12.5px] font-medium text-primary hover:underline">
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </>
          )}
          {thumbs.length > 0 && (
            <div className={cn("mt-3 grid gap-1.5", thumbs.length === 1 ? "grid-cols-1" : thumbs.length === 2 ? "grid-cols-2" : "grid-cols-4")}>
              {thumbs.map((m, i) => (
                <div key={m.id} className="relative">
                  <MediaThumb media={m} alt={`Photo ${i + 1} of ${event.title}`} onClick={() => setViewer(i)} className={thumbs.length === 1 ? "aspect-[16/9]" : ""} />
                  {i === thumbs.length - 1 && extra > 0 && (
                    <button type="button" onClick={() => setViewer(i)} className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/55 text-[15px] font-semibold text-white" aria-label={`Show ${extra} more photos`}>
                      +{extra}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.article>
      </div>
      <MediaViewer items={event.media} index={viewer} onIndexChange={setViewer} caption={() => event.title} />
    </>
  );
}

function RelatedItem({ entry, side }: { entry: RelatedEntry; side: "left" | "right" }) {
  const isMemory = entry.kind === "memory";
  const Icon = isMemory ? Images : CheckCircle2;
  return (
    <>
      <Dot color={isMemory ? "var(--secondary)" : "var(--success)"} small />
      <div className={sideClass(side)}>
        <Link
          href={entry.href}
          className="flex items-center gap-3 rounded-[12px] border border-dashed border-line-strong bg-surface-2 px-3 py-2.5 transition-colors hover:border-primary focus-visible:border-primary"
        >
          <Icon className={cn("h-4 w-4 shrink-0", isMemory ? "text-fg-2" : "text-success")} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{entry.title}</span>
            <span className="block truncate text-[12px] text-fg-3">
              {isMemory ? "Memory" : "Bucket list · done"} · {formatTimelineDate(entry.dateKey, "day", true)}
              {entry.subtitle && isMemory ? ` · ${entry.subtitle}` : ""}
            </span>
          </span>
        </Link>
      </div>
    </>
  );
}

function Chip({ on, onClick, color, children }: { on: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors", on ? (color ? "text-fg" : "border-transparent bg-fg text-surface") : "border-transparent bg-surface-2 text-fg-2 hover:text-fg")}
      style={on && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, var(--surface))` } : undefined}
    >
      {children}
    </button>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("flex", i % 2 ? "md:justify-end" : "")}>
          <Skeleton className="h-28 w-full rounded-[14px] md:w-[48%]" />
        </div>
      ))}
    </div>
  );
}
