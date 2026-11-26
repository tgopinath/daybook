"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isThisYear, isToday } from "date-fns";
import { FileText, Pin, Plus, Search, Star, StickyNote } from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { DemoBadge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { NoteEditor } from "./note-editor";
import type { NoteFull, NoteListItem, NotesMeta } from "./types";

type Filter = "all" | "pinned" | "favorites";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

function when(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  return format(d, isThisYear(d) ? "MMM d" : "MMM d, yyyy");
}

export function NotesView() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("id");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [facet, setFacet] = useState(""); // "c:<id>" | "t:<id>" | ""
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q.trim(), 250);

  const listUrl = useMemo(() => {
    const sp = new URLSearchParams({ scope: "active" });
    if (dq) sp.set("q", dq);
    if (filter !== "all") sp.set("filter", filter);
    if (facet.startsWith("c:")) sp.set("categoryId", facet.slice(2));
    if (facet.startsWith("t:")) sp.set("tag", facet.slice(2));
    return `/api/notes?${sp}`;
  }, [dq, filter, facet]);

  const { data, error, isLoading } = useApi<{ items: NoteListItem[] }>(listUrl);
  const { data: meta } = useApi<NotesMeta>("/api/notes/meta");
  const items = data?.items;

  const select = (id: string | null) => router.replace(id ? `/notes?id=${id}` : "/notes", { scroll: false });

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = {};
      if (facet.startsWith("c:")) body.categoryId = facet.slice(2);
      if (filter === "pinned") body.pinned = true;
      if (filter === "favorites") body.favorite = true;
      const res = await api.post<{ item: NoteFull }>("/api/notes", body);
      refresh("/api/notes", ...SUMMARY_KEYS);
      select(res.item.id);
    } catch (err) {
      toastError(err);
    } finally {
      setCreating(false);
    }
  };

  // `/notes?new=1` (from search quick actions) creates a note straight away.
  const handledNew = useRef(false);
  useEffect(() => {
    if (params.get("new") !== "1") handledNew.current = false; // ready for the next ?new=1 (the "New" menu)
    else if (!handledNew.current) {
      handledNew.current = true;
      void create();
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinnedCount = items?.filter((n) => n.pinned).length ?? 0;
  const filtered = !!(dq || filter !== "all" || facet);

  return (
    <div className="-mt-2 flex flex-col md:h-[calc(100dvh-8rem)]">
      <div className={cn("mb-4 flex items-center justify-between gap-3", selected && "hidden md:flex")}>
        <h1 className="text-[22px] font-semibold tracking-tight">Notes</h1>
        <Button onClick={create} loading={creating}>
          {!creating && <Plus className="h-4 w-4" />} New note
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden md:rounded-[14px] md:border md:border-line md:bg-surface md:shadow-card">
        {/* List */}
        <aside className={cn("flex min-h-0 w-full flex-col md:w-[320px] md:shrink-0 md:border-r md:border-line lg:w-[340px]", selected && "hidden md:flex")}>
          <div className="flex flex-col gap-2 pb-3 md:p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "pinned", label: "Pinned", icon: Pin },
                  { value: "favorites", label: "Favorites", icon: Star },
                ]}
              />
              <div className="min-w-0 flex-1">
                <Select aria-label="Filter by category or tag" value={facet} onChange={(e) => setFacet(e.target.value)} className="h-8 text-[12.5px]">
                  <option value="">Any category</option>
                  {!!meta?.categories.length && (
                    <optgroup label="Categories">
                      {meta.categories.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {!!meta?.tags.filter((t) => t.count > 0).length && (
                    <optgroup label="Tags">
                      {meta.tags
                        .filter((t) => t.count > 0)
                        .map((t) => (
                          <option key={t.id} value={`t:${t.id}`}>
                            #{t.name} ({t.count})
                          </option>
                        ))}
                    </optgroup>
                  )}
                </Select>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto md:px-2 md:pb-2 scroll-thin">
            {error && !items ? (
              <p className="p-4 text-sm text-danger">Couldn&apos;t load notes. {error.message}</p>
            ) : isLoading && !items ? (
              <div className="flex flex-col gap-2 p-1" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full" />
                ))}
              </div>
            ) : !items?.length ? (
              filtered ? (
                <EmptyState icon={Search} title="No matching notes" description="Try a different search or filter." className="py-10" />
              ) : (
                <EmptyState
                  icon={StickyNote}
                  title="No notes yet"
                  description="Capture ideas, meeting notes and checklists."
                  action={
                    <Button onClick={create} loading={creating}>
                      <Plus className="h-4 w-4" /> New note
                    </Button>
                  }
                  className="py-10"
                />
              )
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((n, i) => (
                  <li key={n.id}>
                    {filter === "all" && pinnedCount > 0 && i === pinnedCount && <div className="mx-2 my-1.5 h-px bg-line" />}
                    <button
                      onClick={() => select(n.id)}
                      aria-current={selected === n.id}
                      className={cn(
                        "group flex w-full flex-col gap-1 rounded-[10px] border border-transparent px-3 py-2.5 text-left transition-colors",
                        "max-md:border-line max-md:bg-surface",
                        selected === n.id ? "bg-primary-soft/70 md:border-primary/20" : "hover:bg-surface-2",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {n.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-primary" aria-label="Pinned" />}
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{n.title || "Untitled"}</span>
                        {n.favorite && <Star className="h-3 w-3 shrink-0 fill-current text-warning" aria-label="Favorite" />}
                        <span className="shrink-0 text-[11.5px] text-fg-3 tabular-nums">{when(n.updatedAt)}</span>
                      </div>
                      <p className="line-clamp-2 text-[12.5px] leading-snug text-fg-2">{n.excerpt || <span className="text-fg-3">No content</span>}</p>
                      {(n.category || n.tags.length > 0 || n.isDemo) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
                          {n.category && (
                            <span className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: n.category.color }} />
                              {n.category.name}
                            </span>
                          )}
                          {n.tags.slice(0, 3).map((t) => (
                            <span key={t.id}>#{t.name}</span>
                          ))}
                          {n.tags.length > 3 && <span>+{n.tags.length - 3}</span>}
                          <DemoBadge show={n.isDemo} />
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Editor */}
        <section className={cn("min-h-0 min-w-0 flex-1 max-md:rounded-[14px] max-md:border max-md:border-line max-md:bg-surface", !selected && "hidden md:block")}>
          {selected ? (
            <NoteEditor id={selected} onBack={() => select(null)} onClosed={() => select(null)} onSelect={select} />
          ) : (
            <EmptyState
              icon={FileText}
              title="Select a note"
              description="Pick a note from the list, or start a new one."
              action={
                <Button variant="outline" onClick={create} loading={creating}>
                  <Plus className="h-4 w-4" /> New note
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
