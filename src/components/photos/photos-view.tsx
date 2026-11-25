"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart, Camera, Check, CheckSquare, FolderMinus, FolderPlus, Heart, HeartOff, MoreHorizontal, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb, MediaUploader, MediaViewer } from "@/components/media/media";
import { GooglePhotosImport } from "@/components/google-photos/import-button";
import { MemoryDialog, type MemoryDraft } from "@/components/memories/memory-dialog";
import { LoadMoreSentinel, MonthJumpBar, fmtDay, useDebounced, useMonthJump, usePaged } from "@/components/memories/shared";
import type { CollectionItem, PhotoItem, PhotoPage } from "@/components/memories/types";
import { SUMMARY_KEYS, api, refresh, useApi } from "@/lib/client";
import { ACCEPT, type Media } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { CollectionDialog, TagDialog } from "./collection-dialog";
import { PhotoCaption } from "./photo-caption";

export function PhotosView() {
  const router = useRouter();
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [collectionDialog, setCollectionDialog] = useState<{ open: boolean; collection: CollectionItem | null }>({ open: false, collection: null });
  const [tagDialog, setTagDialog] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft | null>(null);

  const params = new URLSearchParams();
  if (collectionId) params.set("collectionId", collectionId);
  if (tag) params.set("tag", tag);
  if (favorite) params.set("favorite", "1");
  if (q) params.set("q", q);
  const list = usePaged<PhotoPage>(`/api/photos${params.size ? `?${params}` : ""}`);
  const { data: collections } = useApi<{ items: CollectionItem[] }>("/api/photo-collections");
  const collection = collections?.items.find((c) => c.id === collectionId) ?? null;
  const tags = list.first?.tags ?? [];
  const filtered = !!(collectionId || tag || favorite || q);
  const jump = useMonthJump("ph", list.hasMore, list.size, list.setSize, list.items.length);

  const photos = list.items;
  const media = useMemo(() => photos.map((p) => p.media), [photos]);
  const byMedia = useMemo(() => new Map(photos.map((p) => [p.media.id, p])), [photos]);
  const days = useMemo(() => {
    const out: { day: string; items: { p: PhotoItem; i: number }[] }[] = [];
    photos.forEach((p, i) => {
      const last = out[out.length - 1];
      if (last?.day === p.takenOn) last.items.push({ p, i });
      else out.push({ day: p.takenOn, items: [{ p, i }] });
    });
    return out;
  }, [photos]);
  const firstOfMonth = useMemo(() => {
    const seen = new Set<string>();
    return new Set(days.filter((d) => !seen.has(d.day.slice(0, 7)) && seen.add(d.day.slice(0, 7))).map((d) => d.day));
  }, [days]);

  const reload = useCallback(() => {
    void list.reload();
    void refresh("/api/photos", "/api/photo-collections", "/api/memories/on-this-day", ...SUMMARY_KEYS);
  }, [list]);

  // Coalesce refreshes while many uploads finish.
  const pendingReload = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUploaded = useCallback(
    async (m: Media) => {
      try {
        await api.post("/api/photos", { mediaId: m.id, collectionId });
      } catch (err) {
        toastError(err);
      }
      if (pendingReload.current) clearTimeout(pendingReload.current);
      pendingReload.current = setTimeout(reload, 400);
    },
    [collectionId, reload],
  );

  const ids = [...selected];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const endSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const bulk = async (body: Record<string, unknown>, msg: string, keepSelection = false) => {
    try {
      const r = await api.post<{ count: number }>("/api/photos/bulk", { ids, ...body });
      reload();
      if (!keepSelection) endSelect();
      toast.success(msg.replace("{n}", String(r.count)));
      return r;
    } catch (err) {
      toastError(err);
    }
  };

  const softDelete = async (targetIds: string[]) => {
    try {
      await api.post("/api/photos/bulk", { action: "delete", ids: targetIds });
      reload();
      endSelect();
      toast.undo(targetIds.length === 1 ? "Photo moved to Trash" : `${targetIds.length} photos moved to Trash`, async () => {
        try {
          await api.post("/api/photos/bulk", { action: "restore", ids: targetIds });
          reload();
        } catch (err) {
          toastError(err);
        }
      });
    } catch (err) {
      toastError(err);
    }
  };

  const createMemory = (from: PhotoItem[]) => {
    if (!from.length) return;
    const sorted = [...from].sort((a, b) => (a.takenOn < b.takenOn ? -1 : 1));
    setMemoryDraft({ title: "", day: sorted[0]!.takenOn, caption: from.length === 1 ? (from[0]!.caption ?? "") : "", media: from.map((p) => p.media) });
  };

  const deleteCollection = async (c: CollectionItem) => {
    const ok = await confirm({ title: `Delete “${c.title}”?`, body: "The collection goes away; its photos stay in your diary.", destructive: true, confirmLabel: "Delete collection" });
    if (!ok) return;
    try {
      await api.delete(`/api/photo-collections/${c.id}`);
      setCollectionId(null);
      reload();
      toast.success("Collection deleted");
    } catch (err) {
      toastError(err);
    }
  };

  const selectedPhotos = photos.filter((p) => selected.has(p.id));
  const collectionItems: MenuItem[] = [
    ...(collections?.items ?? []).map((c) => ({ label: c.title, onSelect: () => void bulk({ action: "collection", collectionId: c.id }, `Added {n} to ${c.title}`) })),
    ...(collections?.items.length ? [{ type: "separator" as const }] : []),
    { label: "New collection…", icon: Plus, onSelect: () => setCollectionDialog({ open: true, collection: null }) },
    { label: "Remove from collection", icon: FolderMinus, onSelect: () => void bulk({ action: "collection", collectionId: null }, "Removed {n} from their collection") },
  ];

  const viewerPhoto = viewer !== null ? photos[viewer] : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Photo Diary"
        description={list.first?.total ? `${list.first.total} ${list.first.total === 1 ? "photo" : "photos"} of everyday life` : "Little snapshots of your days."}
        actions={
          <>
            <GooglePhotosImport target="photos" collectionId={collectionId} returnPath="/photos" onImported={() => reload()} />
            {photos.length > 0 && (
              <Button variant={selecting ? "secondary" : "outline"} onClick={() => (selecting ? endSelect() : setSelecting(true))}>
                <CheckSquare className="h-4 w-4" /> {selecting ? "Done" : "Select"}
              </Button>
            )}
            <MediaUploader variant="button" label="Upload" accept={ACCEPT.imagesAndVideos} onUploaded={onUploaded} />
          </>
        }
      >
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 scroll-thin" role="tablist" aria-label="Collections">
          <CollectionChip active={!collectionId} onClick={() => setCollectionId(null)} label="All photos" />
          {collections?.items.map((c) => (
            <CollectionChip key={c.id} active={collectionId === c.id} onClick={() => setCollectionId(c.id)} label={c.title} count={c.count} />
          ))}
          <button
            type="button"
            onClick={() => setCollectionDialog({ open: true, collection: null })}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] font-medium text-fg-2 hover:border-primary hover:text-primary"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New collection
          </button>
          {collection && (
            <Menu
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Collection options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                { label: "Rename", icon: Pencil, onSelect: () => setCollectionDialog({ open: true, collection }) },
                { type: "separator" },
                { label: "Delete collection", icon: Trash2, danger: true, onSelect: () => void deleteCollection(collection) },
              ]}
            />
          )}
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search captions and #tags" aria-label="Search photos" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            aria-pressed={favorite}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium", favorite ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-fg-2 hover:text-fg")}
          >
            <Heart className="h-3.5 w-3.5" fill={favorite ? "currentColor" : "none"} /> Favourites
          </button>
          {tags.length > 0 && (
            <select value={tag ?? ""} onChange={(e) => setTag(e.target.value || null)} aria-label="Filter by tag" className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg">
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  #{t.tag} ({t.count})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <MonthJumpBar months={list.first?.months ?? []} onJump={jump} className="mb-3" />

      {list.error && !photos.length ? (
        <EmptyState icon={Camera} title="Couldn't load your photos" description={list.error.message} action={<Button onClick={() => list.reload()}>Try again</Button>} />
      ) : list.isLoading && !photos.length ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6" aria-busy="true" aria-label="Loading photos">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-[10px]" />
          ))}
        </div>
      ) : !photos.length ? (
        filtered ? (
          <EmptyState
            icon={Search}
            title="No photos here"
            description={collection ? "This collection is empty — upload photos while it's open, or select photos and add them." : "Try another search or clear the filters."}
            action={
              collection ? (
                <MediaUploader variant="button" label="Upload to this collection" accept={ACCEPT.imagesAndVideos} onUploaded={onUploaded} />
              ) : (
                <Button variant="outline" onClick={() => (setSearch(""), setTag(null), setFavorite(false), setCollectionId(null))}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div className="mx-auto max-w-lg py-6">
            <EmptyState icon={Camera} title="Your photo diary starts today" description="Upload a few photos — we'll sort them by the day they were taken." className="pb-6" />
            <MediaUploader accept={ACCEPT.imagesAndVideos} label="Add your first photos" hint="Drag photos or videos here, or click to choose" onUploaded={onUploaded} />
          </div>
        )
      ) : (
        <div>
          {days.map((d) => (
            <section key={d.day} id={firstOfMonth.has(d.day) ? `ph-${d.day.slice(0, 7)}` : undefined} className="scroll-mt-2" aria-label={fmtDay(d.day, "EEEE d MMMM yyyy")}>
              <h2 className="sticky top-0 z-10 -mx-1 mb-1.5 flex items-center justify-between bg-bg px-1 py-2 text-[13.5px] font-semibold text-fg">
                <span>
                  {fmtDay(d.day, "EEE, d MMM")} <span className="font-normal text-fg-2">{fmtDay(d.day, "yyyy")}</span>
                </span>
                {selecting && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        const all = d.items.every(({ p }) => n.has(p.id));
                        d.items.forEach(({ p }) => (all ? n.delete(p.id) : n.add(p.id)));
                        return n;
                      })
                    }
                    className="text-[12.5px] font-medium text-primary hover:underline"
                  >
                    {d.items.every(({ p }) => selected.has(p.id)) ? "Unselect day" : "Select day"}
                  </button>
                )}
              </h2>
              <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {d.items.map(({ p, i }) => {
                  const on = selected.has(p.id);
                  return (
                    <div key={p.id} className="group relative">
                      <MediaThumb
                        media={p.media}
                        alt={p.caption || p.media.originalName || "Photo"}
                        onClick={() => (selecting ? toggle(p.id) : setViewer(i))}
                        className={cn(on && "ring-3 ring-primary ring-offset-2 ring-offset-bg")}
                      />
                      {selecting && (
                        <span
                          aria-hidden
                          className={cn("pointer-events-none absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2", on ? "border-primary bg-primary text-on-primary" : "border-white bg-black/40")}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      )}
                      {p.favorite && !selecting && (
                        <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-full bg-black/65 p-1 text-white" aria-label="Favourite">
                          <Heart className="h-3 w-3" fill="currentColor" />
                        </span>
                      )}
                      {p.caption && (
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 rounded-b-[10px] bg-black/65 px-2 py-1 text-[11.5px] text-white">{p.caption}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <LoadMoreSentinel active={list.hasMore} loading={list.loadingMore} onVisible={list.loadMore} />
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 md:bottom-6" role="toolbar" aria-label="Selected photos">
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-modal scroll-thin">
            <span className="px-2 text-[13px] font-medium whitespace-nowrap text-fg">{selected.size} selected</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)))}>
              {selected.size === photos.length ? "None" : "All"}
            </Button>
            <span className="h-5 w-px bg-line" aria-hidden />
            <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => void bulk({ action: "favorite", value: !selectedPhotos.every((p) => p.favorite) }, selectedPhotos.every((p) => p.favorite) ? "Removed {n} from favourites" : "Added {n} to favourites")}>
              {selectedPhotos.length && selectedPhotos.every((p) => p.favorite) ? <HeartOff className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
              <span className="hidden sm:inline">Favourite</span>
            </Button>
            <Menu
              trigger={
                <Button variant="ghost" size="sm" disabled={!selected.size}>
                  <FolderPlus className="h-4 w-4" /> <span className="hidden sm:inline">Collection</span>
                </Button>
              }
              items={collectionItems}
              align="center"
            />
            <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => setTagDialog(true)}>
              <Tag className="h-4 w-4" /> <span className="hidden sm:inline">Tag</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => createMemory(selectedPhotos)}>
              <BookHeart className="h-4 w-4" /> <span className="hidden sm:inline">Create memory</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => void softDelete(ids)} className="text-danger hover:text-danger">
              <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Exit select mode" onClick={endSelect}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <MediaViewer
        items={media}
        index={viewer}
        onIndexChange={setViewer}
        onDelete={(m) => {
          const p = byMedia.get(m.id);
          if (!p) return;
          setViewer(null);
          void softDelete([p.id]);
        }}
        caption={(m) => {
          const p = byMedia.get(m.id);
          return p ? <PhotoCaption photo={p} onChanged={reload} /> : null;
        }}
      />
      {viewerPhoto && viewer !== null && (
        <div className="sr-only" aria-live="polite">
          {viewerPhoto.caption || "Photo"} · {fmtDay(viewerPhoto.takenOn)}
        </div>
      )}

      <CollectionDialog
        open={collectionDialog.open}
        onOpenChange={(o) => setCollectionDialog((s) => ({ ...s, open: o }))}
        collection={collectionDialog.collection}
        onSaved={(c) => {
          if (collectionDialog.collection) return;
          if (selecting && selected.size) void bulk({ action: "collection", collectionId: c.id }, `Added {n} to ${c.title}`);
          else setCollectionId(c.id);
        }}
      />
      <TagDialog
        open={tagDialog}
        onOpenChange={setTagDialog}
        known={tags.map((t) => t.tag)}
        onApply={async (t, mode) => void (await bulk({ action: mode === "add" ? "addTags" : "removeTags", tags: t }, mode === "add" ? "Tagged {n} photos" : "Removed tags from {n} photos", true))}
      />
      <MemoryDialog
        open={!!memoryDraft}
        onOpenChange={(o) => !o && setMemoryDraft(null)}
        draft={memoryDraft}
        onSaved={(m) => {
          endSelect();
          toast.success("Memory created", { action: { label: "Open", onClick: () => router.push(`/memories/${m.id}`) } });
        }}
      />
    </div>
  );
}

function CollectionChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-fg-2 hover:text-fg",
      )}
    >
      {label}
      {count !== undefined && <span className="text-[11.5px] tabular-nums">{count}</span>}
    </button>
  );
}
