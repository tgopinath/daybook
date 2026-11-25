"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceStrict } from "date-fns";
import { Archive, Check, GripVertical, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Rows3, Sparkles, Trash2, Undo2 } from "lucide-react";
import { api, refresh, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Card, DemoBadge, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { cn, pluralize } from "@/lib/utils";
import { BUCKET_CATEGORIES, bucketMeta, type BucketCategory } from "./meta";
import { BucketDialog, BUCKET_KEYS } from "./bucket-dialog";
import type { BucketItemDTO, BucketListResponse } from "./types";

type Status = "all" | "todo" | "done";
type Sort = "manual" | "target" | "newest";
type View = "grid" | "list";

const VIEW_KEY = "mydiary-bucket-view";

function localTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtKey = (key: string, withDay = true) => {
  const [y, m, d] = key.split("-").map(Number);
  return withDay ? `${d} ${MONTHS[m! - 1]} ${y}` : `${MONTHS[m! - 1]} ${y}`;
};

/** "In 2 years", "Overdue · Mar 2025", "Done · 12 Jan 2026". */
function whenLabel(item: BucketItemDTO): { text: string; tone: "muted" | "danger" | "success" } | null {
  if (item.completedAt) return { text: `Done · ${fmtKey(item.completedAt.slice(0, 10))}`, tone: "success" };
  if (!item.targetDate) return null;
  const key = item.targetDate.slice(0, 10);
  const today = localTodayKey();
  if (key < today) return { text: `Overdue · ${fmtKey(key, false)}`, tone: "danger" };
  if (key === today) return { text: "Today", tone: "muted" };
  const [y, m, d] = key.split("-").map(Number);
  const rel = formatDistanceStrict(new Date(y!, m! - 1, d!), new Date(), { addSuffix: true, roundingMethod: "floor" });
  return { text: rel.charAt(0).toUpperCase() + rel.slice(1), tone: "muted" };
}

export function BucketListView() {
  const { data, error, isLoading, mutate } = useApi<BucketListResponse>("/api/bucket-list");
  const items = useMemo(() => data?.items ?? [], [data]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [category, setCategory] = useState<"" | BucketCategory>("");
  const [status, setStatus] = useState<Status>("all");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState<Sort>("manual");
  const [view, setView] = useState<View>("grid");
  const [dialog, setDialog] = useState<{ open: boolean; item: BucketItemDTO | null }>({ open: false, item: null });
  const [celebrate, setCelebrate] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // Deep link: /bucket-list?id=… opens that item; ?new=1 opens a blank one.
  const deepId = params.get("id");
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (wantsNew) {
      setDialog({ open: true, item: null });
      router.replace(pathname, { scroll: false });
      return;
    }
    if (!deepId || !data) return;
    const it = items.find((i) => i.id === deepId);
    if (it) setDialog({ open: true, item: it });
    else toast.info("That bucket list item isn't here any more");
    router.replace(pathname, { scroll: false });
  }, [deepId, wantsNew, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => [...new Set(items.filter((i) => i.targetDate).map((i) => i.targetDate!.slice(0, 4)))].sort(), [items]);

  const visible = useMemo(() => {
    let list = items.filter(
      (i) =>
        (!category || i.category === category) &&
        (status === "all" || (status === "done" ? !!i.completedAt : !i.completedAt)) &&
        (!year || i.targetDate?.slice(0, 4) === year),
    );
    if (sort === "target") list = [...list].sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));
    else if (sort === "newest") list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [items, category, status, year, sort]);

  const setItems = useCallback(
    (fn: (list: BucketItemDTO[]) => BucketItemDTO[]) => mutate((d) => (d ? { ...d, items: fn(d.items) } : d), { revalidate: false }),
    [mutate],
  );
  const patchLocal = (id: string, patch: Partial<BucketItemDTO>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const toggleDone = async (item: BucketItemDTO) => {
    const done = !item.completedAt;
    patchLocal(item.id, { completedAt: done ? new Date().toISOString() : null });
    if (done) {
      setCelebrate(item.id);
      setTimeout(() => setCelebrate((c) => (c === item.id ? null : c)), 1400);
    }
    try {
      await api.patch(`/api/bucket-list/${item.id}`, { completed: done });
      await refresh(...BUCKET_KEYS);
      if (done)
        toast.undo(`Ticked off: ${item.title}`, async () => {
          try {
            await api.patch(`/api/bucket-list/${item.id}`, { completed: false });
            await refresh(...BUCKET_KEYS);
          } catch (err) {
            toastError(err);
          }
        });
    } catch (err) {
      toastError(err);
      await mutate();
    }
  };

  const archive = async (item: BucketItemDTO) => {
    setItems((l) => l.filter((i) => i.id !== item.id));
    try {
      await api.patch(`/api/bucket-list/${item.id}`, { archived: true });
      await refresh(...BUCKET_KEYS);
      toast.undo(`Archived "${item.title}"`, async () => {
        await api.patch(`/api/bucket-list/${item.id}`, { archived: false }).catch(toastError);
        await refresh(...BUCKET_KEYS);
      });
    } catch (err) {
      toastError(err);
      await mutate();
    }
  };

  const remove = async (item: BucketItemDTO) => {
    setDialog((d) => ({ ...d, open: false }));
    setItems((l) => l.filter((i) => i.id !== item.id));
    try {
      await api.delete(`/api/bucket-list/${item.id}`);
      await refresh(...BUCKET_KEYS);
      toast.undo(`"${item.title}" moved to Recently Deleted`, async () => {
        await api.patch(`/api/bucket-list/${item.id}`, { deletedAt: null }).catch(toastError);
        await refresh(...BUCKET_KEYS);
      });
    } catch (err) {
      toastError(err);
      await mutate();
    }
  };

  // Manual reorder works on the visible subset; hidden items keep their slots.
  const reorder = async (fromId: string, toId: string) => {
    const vis = visible.map((i) => i.id);
    const moved = arrayMove(vis, vis.indexOf(fromId), vis.indexOf(toId));
    const visSet = new Set(vis);
    let k = 0;
    const full = items.map((i) => (visSet.has(i.id) ? moved[k++]! : i.id));
    const byId = new Map(items.map((i) => [i.id, i]));
    setItems(() => full.map((id, idx) => ({ ...byId.get(id)!, sortOrder: idx })));
    try {
      await api.post("/api/bucket-list/reorder", { order: full });
      await refresh("/api/bucket-list");
    } catch (err) {
      toastError(err);
      await mutate();
    }
  };

  const filtersOn = !!category || status !== "all" || !!year;
  const openNew = () => setDialog({ open: true, item: null });
  const openEdit = (item: BucketItemDTO) => setDialog({ open: true, item });

  return (
    <div>
      <PageHeader
        title="Bucket List"
        description="The experiences you want to collect in this one wild life."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Add adventure
          </Button>
        }
      />

      {error && !data && (
        <Card className="p-6 text-center text-[13.5px] text-danger">Couldn&apos;t load your bucket list. {error.message}</Card>
      )}

      {isLoading && !data && <BucketSkeleton />}

      {data && items.length === 0 && (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Dream big — add your first adventure"
            description="Places to see, skills to learn, moments to share. Write them down and start ticking them off."
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Add adventure
              </Button>
            }
          />
        </Card>
      )}

      {data && items.length > 0 && (
        <>
          <ProgressPanel items={items} onCategory={(c) => setCategory((x) => (x === c ? "" : c))} active={category} />

          <div className="mt-6 mb-4 flex flex-col gap-3">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-thin" role="tablist" aria-label="Category">
              <Chip on={!category} onClick={() => setCategory("")}>
                All
              </Chip>
              {BUCKET_CATEGORIES.map((c) => {
                const M = bucketMeta(c);
                return (
                  <Chip key={c} on={category === c} onClick={() => setCategory(c)} color={M.color}>
                    <M.icon className="h-3.5 w-3.5" style={{ color: M.color }} /> {c}
                  </Chip>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<Status>
                size="sm"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "All" },
                  { value: "todo", label: "To do", count: items.filter((i) => !i.completedAt).length },
                  { value: "done", label: "Done", count: items.filter((i) => i.completedAt).length },
                ]}
              />
              {years.length > 0 && (
                <Select aria-label="Target year" value={year} onChange={(e) => setYear(e.target.value)} className="h-8 w-[118px] text-[13px]">
                  <option value="">Any year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              )}
              <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 w-[150px] text-[13px]">
                <option value="manual">My order</option>
                <option value="target">Target date</option>
                <option value="newest">Newest first</option>
              </Select>
              <div className="ml-auto">
                <Segmented<View>
                  size="sm"
                  value={view}
                  onChange={changeView}
                  options={[
                    { value: "grid", label: "Cards", icon: LayoutGrid },
                    { value: "list", label: "List", icon: List },
                  ]}
                />
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={Rows3}
                title="Nothing matches these filters"
                description="Try another category, status or year."
                action={
                  filtersOn ? (
                    <Button variant="outline" onClick={() => (setCategory(""), setStatus("all"), setYear(""))}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Sortable ids={visible.map((i) => i.id)} enabled={sort === "manual"} grid={view === "grid"} onMove={reorder}>
              {view === "grid" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((i) => (
                    <SortableItem key={i.id} id={i.id} enabled={sort === "manual"}>
                      {(handle) => <BucketCard item={i} handle={handle} celebrating={celebrate === i.id} onToggle={() => toggleDone(i)} onOpen={() => openEdit(i)} onArchive={() => archive(i)} onDelete={() => remove(i)} />}
                    </SortableItem>
                  ))}
                </div>
              ) : (
                <Card className="divide-y divide-line overflow-hidden">
                  {visible.map((i) => (
                    <SortableItem key={i.id} id={i.id} enabled={sort === "manual"}>
                      {(handle) => <BucketRow item={i} handle={handle} celebrating={celebrate === i.id} onToggle={() => toggleDone(i)} onOpen={() => openEdit(i)} onArchive={() => archive(i)} onDelete={() => remove(i)} />}
                    </SortableItem>
                  ))}
                </Card>
              )}
            </Sortable>
          )}
          {sort === "manual" && visible.length > 1 && <p className="mt-3 text-center text-[12px] text-fg-3">Drag the handle to put your dreams in order.</p>}
        </>
      )}

      <BucketDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        item={dialog.item}
        initialCategory={category || undefined}
        onDelete={remove}
      />
    </div>
  );
}

// ------------------------------------------------------------------ progress

function ProgressRing({ value, size = 104 }: { value: number; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${value}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * value) / 100 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[26px] leading-none font-semibold tabular-nums">{value}%</span>
        <span className="mt-0.5 text-[11px] text-fg-3">done</span>
      </span>
    </div>
  );
}

function ProgressPanel({ items, onCategory, active }: { items: BucketItemDTO[]; onCategory: (c: BucketCategory) => void; active: string }) {
  const done = items.filter((i) => i.completedAt).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const cats = BUCKET_CATEGORIES.map((c) => {
    const list = items.filter((i) => i.category === c);
    const d = list.filter((i) => i.completedAt).length;
    return { c, total: list.length, done: d, pct: list.length ? Math.round((d / list.length) * 100) : 0 };
  }).filter((x) => x.total > 0);
  const nextUp = items
    .filter((i) => !i.completedAt && i.targetDate && i.targetDate.slice(0, 10) >= localTodayKey())
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))[0];
  return (
    <Card className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} />
        <div>
          <p className="font-display text-[19px] leading-snug font-semibold">
            {done === 0 ? "Your adventures await" : done === items.length ? "Every dream ticked off!" : `${done} of ${items.length} dreams lived`}
          </p>
          <p className="mt-1 text-[13px] text-fg-2">{pluralize(items.length - done, "adventure")} still to go</p>
          {nextUp && (
            <p className="mt-1 text-[12px] text-fg-3">
              Next up: <span className="text-fg-2">{nextUp.title}</span>
            </p>
          )}
        </div>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {cats.map((x) => {
          const M = bucketMeta(x.c);
          return (
            <button key={x.c} type="button" onClick={() => onCategory(x.c)} className={cn("group flex flex-col gap-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface-2", active === x.c && "bg-surface-2")} aria-pressed={active === x.c}>
              <span className="flex items-center gap-1.5 text-[12.5px]">
                <M.icon className="h-3.5 w-3.5" style={{ color: M.color }} />
                <span className="font-medium">{x.c}</span>
                <span className="ml-auto text-fg-3 tabular-nums">
                  {x.done}/{x.total}
                </span>
              </span>
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <motion.span className="block h-full rounded-full" style={{ background: M.color }} initial={{ width: 0 }} animate={{ width: `${x.pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ sortable

function Sortable({ ids, enabled, grid, onMove, children }: { ids: string[]; enabled: boolean; grid: boolean; onMove: (from: string, to: string) => void; children: React.ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!enabled) return <>{children}</>;
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onMove(String(e.active.id), String(e.over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

type Handle = { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined } | null;

function SortableItem({ id, enabled, children }: { id: string; enabled: boolean; children: (handle: Handle) => React.ReactNode }) {
  if (!enabled) return <div>{children(null)}</div>;
  return <SortableInner id={id}>{children}</SortableInner>;
}

function SortableInner({ id, children }: { id: string; children: (handle: Handle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative", isDragging && "z-10 opacity-80")}>
      {children({ attributes: attributes as unknown as Record<string, unknown>, listeners: listeners as Record<string, unknown> | undefined })}
    </div>
  );
}

function DragHandle({ handle, className }: { handle: Handle; className?: string }) {
  if (!handle) return null;
  return (
    <button type="button" {...handle.attributes} {...handle.listeners} aria-label="Drag to reorder" className={cn("cursor-grab touch-none rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg active:cursor-grabbing", className)}>
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

// ------------------------------------------------------------------ card / row

type ItemProps = { item: BucketItemDTO; handle: Handle; celebrating: boolean; onToggle: () => void; onOpen: () => void; onArchive: () => void; onDelete: () => void };

function itemMenu(p: ItemProps) {
  return [
    { label: "Edit", icon: Pencil, onSelect: p.onOpen },
    { label: p.item.completedAt ? "Mark as not done" : "Mark as done", icon: p.item.completedAt ? Undo2 : Check, onSelect: p.onToggle },
    { label: "Archive", icon: Archive, onSelect: p.onArchive },
    { type: "separator" as const },
    { label: "Delete", icon: Trash2, onSelect: p.onDelete, danger: true },
  ];
}

function DoneButton({ done, color, onToggle, title, celebrating, size = "md" }: { done: boolean; color: string; onToggle: () => void; title: string; celebrating: boolean; size?: "sm" | "md" }) {
  const dim = size === "sm" ? 24 : 32;
  return (
    <span className="relative inline-flex">
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        whileTap={{ scale: 0.88 }}
        animate={celebrating ? { scale: [1, 1.25, 1] } : { scale: 1 }}
        transition={{ duration: 0.45 }}
        style={{ width: dim, height: dim, ["--c" as string]: color, ...(done ? { background: color, borderColor: color } : {}) }}
        className={cn("inline-flex items-center justify-center rounded-full border-2 bg-surface/90 text-white shadow-card backdrop-blur transition-colors", done ? "" : "border-line-strong text-transparent hover:border-[var(--c)] hover:text-[var(--c)]")}
      >
        <Check className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={3} />
      </motion.button>
      <Burst show={celebrating} color={color} />
    </span>
  );
}

/** A small, quick ring of sparks around the checkbox. */
function Burst({ show, color }: { show: boolean; color: string }) {
  const sparks = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);
  return (
    <AnimatePresence>
      {show && (
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          {sparks.map((a, i) => (
            <motion.span
              key={i}
              className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
              style={{ background: i % 3 === 0 ? "var(--warning-fill)" : color, marginLeft: -3, marginTop: -3 }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: Math.cos(a) * 30, y: Math.sin(a) * 30, opacity: 0, scale: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          ))}
        </span>
      )}
    </AnimatePresence>
  );
}

function BucketCard(p: ItemProps) {
  const { item } = p;
  const M = bucketMeta(item.category);
  const when = whenLabel(item);
  const done = !!item.completedAt;
  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-card transition-shadow hover:shadow-pop", done && "bg-surface/80")}>
      <button type="button" onClick={p.onOpen} className="relative block aspect-[16/10] w-full overflow-hidden text-left" aria-label={`Open ${item.title}`}>
        {item.image ? (
          <img src={item.image.url} alt="" loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]", done && "saturate-[.75]")} />
        ) : (
          <span className="flex h-full w-full items-center justify-center" style={{ background: `color-mix(in srgb, ${M.color} 12%, var(--surface))` }}>
            <M.icon className="h-10 w-10 opacity-70" style={{ color: M.color }} strokeWidth={1.5} />
          </span>
        )}
        <span className="absolute top-3 left-3 inline-flex h-6 items-center gap-1 rounded-full bg-surface px-2 text-[11.5px] font-medium text-fg-2 shadow-card">
          <M.icon className="h-3.5 w-3.5" style={{ color: M.color }} /> {item.category}
        </span>
        <AnimatePresence>
          {p.celebrating && (
            <motion.span className="absolute inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: `color-mix(in srgb, ${M.color} 30%, transparent)` }}>
              <motion.span initial={{ scale: 0.6, y: 8 }} animate={{ scale: 1, y: 0 }} className="rounded-full bg-surface px-3 py-1 font-display text-[15px] font-semibold shadow-pop">
                Lived it ✨
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <div className="absolute top-3 right-3">
        <DoneButton done={done} color={M.color} onToggle={p.onToggle} title={item.title} celebrating={p.celebrating} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start gap-2">
          <h3 className={cn("min-w-0 flex-1 font-display text-[17px] leading-snug font-semibold", done && "text-fg-2")}>
            <button type="button" onClick={p.onOpen} className="text-left hover:underline focus-visible:underline">
              {item.title}
            </button>
          </h3>
          <DemoBadge show={item.isDemo} />
        </div>
        {item.description && <p className="line-clamp-2 text-[13px] text-fg-2">{item.description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {when ? <WhenText when={when} /> : <span className="text-[12px] text-fg-3">Someday</span>}
          <div className="ml-auto flex items-center">
            <DragHandle handle={p.handle} />
            <Menu
              trigger={
                <button type="button" className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={itemMenu(p)}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function WhenText({ when }: { when: NonNullable<ReturnType<typeof whenLabel>> }) {
  return <span className={cn("text-[12px] font-medium", when.tone === "danger" ? "text-danger" : when.tone === "success" ? "text-success" : "text-fg-3")}>{when.text}</span>;
}

function BucketRow(p: ItemProps) {
  const { item } = p;
  const M = bucketMeta(item.category);
  const when = whenLabel(item);
  const done = !!item.completedAt;
  return (
    <div className="group flex items-center gap-3 bg-surface px-3 py-2.5 sm:px-4">
      <DoneButton done={done} color={M.color} onToggle={p.onToggle} title={item.title} celebrating={p.celebrating} size="sm" />
      <button type="button" onClick={p.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px]" style={{ background: `color-mix(in srgb, ${M.color} 12%, var(--surface))` }}>
          {item.image ? (
            <img src={item.image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <M.icon className="h-4.5 w-4.5" style={{ color: M.color }} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-[14px] font-medium", done && "text-fg-3 line-through decoration-fg-3/50")}>{item.title}</span>
            <DemoBadge show={item.isDemo} />
          </span>
          <span className="flex items-center gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1 text-fg-3"><span className="h-1.5 w-1.5 rounded-full" style={{ background: M.color }} />{item.category}</span>
            {when && (
              <>
                <span className="text-fg-3">·</span>
                <WhenText when={when} />
              </>
            )}
          </span>
        </span>
      </button>
      <DragHandle handle={p.handle} />
      <Menu
        trigger={
          <button type="button" className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        }
        items={itemMenu(p)}
      />
    </div>
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

function BucketSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-[146px] w-full rounded-[14px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-[14px] border border-line bg-surface">
            <Skeleton className="aspect-[16/10] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
