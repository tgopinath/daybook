"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookImage, FolderPlus, Heart, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { GooglePhotosImport } from "@/components/google-photos/import-button";
import { SUMMARY_KEYS, api, refresh, useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { AlbumDialog } from "./album-dialog";
import { MemoryCard } from "./memory-card";
import { MemoryDialog } from "./memory-dialog";
import { OnThisDay } from "./on-this-day";
import { LoadMoreSentinel, MonthJumpBar, fmtMonth, useDebounced, useMonthJump, usePaged } from "./shared";
import type { AlbumItem, MemoryItem, MemoryPage } from "./types";

type Tab = "moments" | "albums";

function MasonrySkeleton() {
  const heights = ["h-64", "h-48", "h-72", "h-56", "h-60", "h-44", "h-64", "h-52"];
  return (
    <div className="columns-2 gap-3 md:columns-3 xl:columns-4" aria-busy="true" aria-label="Loading memories">
      {heights.map((h, i) => (
        <Skeleton key={i} className={cn("mb-3 w-full break-inside-avoid rounded-[14px]", h)} />
      ))}
    </div>
  );
}

export function MemoriesView() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("moments");
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [video, setVideo] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [dialog, setDialog] = useState(false);
  const [albumDialog, setAlbumDialog] = useState<{ open: boolean; album: AlbumItem | null }>({ open: false, album: null });

  const params = new URLSearchParams();
  if (albumId) params.set("albumId", albumId);
  if (favorite) params.set("favorite", "1");
  if (video) params.set("video", "1");
  if (q) params.set("q", q);
  const base = `/api/memories${params.size ? `?${params}` : ""}`;
  const list = usePaged<MemoryPage>(base);
  const { data: albums, isLoading: albumsLoading } = useApi<{ items: AlbumItem[] }>("/api/albums");
  const album = albums?.items.find((a) => a.id === albumId) ?? null;
  const filtered = !!(albumId || favorite || video || q);
  const months = list.first?.months ?? [];
  const jump = useMonthJump("mem", list.hasMore, list.size, list.setSize, list.items.length);

  const groups = useMemo(() => {
    const out: { year: string; months: { key: string; items: MemoryItem[] }[] }[] = [];
    for (const m of list.items) {
      const y = m.day.slice(0, 4);
      const mk = m.day.slice(0, 7);
      let yg = out[out.length - 1];
      if (yg?.year !== y) out.push((yg = { year: y, months: [] }));
      let mg = yg.months[yg.months.length - 1];
      if (mg?.key !== mk) yg.months.push((mg = { key: mk, items: [] }));
      mg.items.push(m);
    }
    return out;
  }, [list.items]);

  const reload = () => {
    void list.reload();
    void refresh("/api/memories", "/api/albums", ...SUMMARY_KEYS);
  };

  const toggleFavorite = async (m: MemoryItem) => {
    try {
      await api.patch(`/api/memories/${m.id}`, { favorite: !m.favorite });
      reload();
    } catch (err) {
      toastError(err);
    }
  };

  const deleteAlbum = async (a: AlbumItem) => {
    const ok = await confirm({ title: `Delete “${a.title}”?`, body: "The album goes away, but its memories stay safe in Memories.", destructive: true, confirmLabel: "Delete album" });
    if (!ok) return;
    try {
      await api.delete(`/api/albums/${a.id}`);
      setAlbumId(null);
      toast.success("Album deleted");
      reload();
    } catch (err) {
      toastError(err);
    }
  };

  const openAlbum = (id: string) => {
    setAlbumId(id);
    setTab("moments");
    document.getElementById("main")?.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={album ? album.title : "Memories"}
        description={
          album
            ? album.description || `${album.count} ${album.count === 1 ? "memory" : "memories"}`
            : list.first?.total
              ? `${list.first.total} ${list.first.total === 1 ? "moment" : "moments"} worth keeping`
              : "The moments you never want to forget."
        }
        actions={
          <>
            <GooglePhotosImport target="memory" returnPath="/memories" onImported={(r) => (reload(), r.memoryId && router.push(`/memories/${r.memoryId}`))} />
            <Button onClick={() => setDialog(true)}>
              <Plus className="h-4 w-4" /> New memory
            </Button>
          </>
        }
      >
        {album ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAlbumId(null)}>
              <ArrowLeft className="h-4 w-4" /> All memories
            </Button>
            <Menu
              trigger={
                <Button variant="outline" size="sm" aria-label="Album options">
                  <MoreHorizontal className="h-4 w-4" /> Album
                </Button>
              }
              items={[
                { label: "Rename & cover", icon: Pencil, onSelect: () => setAlbumDialog({ open: true, album }) },
                { type: "separator" },
                { label: "Delete album", icon: Trash2, danger: true, onSelect: () => void deleteAlbum(album) },
              ]}
            />
          </div>
        ) : (
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "moments", label: "Moments" },
              { value: "albums", label: "Albums", count: albums?.items.length },
            ]}
          />
        )}
      </PageHeader>

      {tab === "albums" && !album ? (
        <AlbumsGrid albums={albums?.items} loading={albumsLoading} onOpen={openAlbum} onNew={() => setAlbumDialog({ open: true, album: null })} />
      ) : (
        <>
          {!filtered && <OnThisDay />}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles, stories, places" aria-label="Search memories" className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {!album && albums && albums.items.length > 0 && (
                <select
                  value={albumId ?? ""}
                  onChange={(e) => setAlbumId(e.target.value || null)}
                  aria-label="Filter by album"
                  className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg"
                >
                  <option value="">All albums</option>
                  {albums.items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              )}
              <FilterChip active={favorite} onClick={() => setFavorite((v) => !v)} icon={Heart} label="Favourites" />
              <FilterChip active={video} onClick={() => setVideo((v) => !v)} icon={Video} label="Has video" />
            </div>
          </div>
          <MonthJumpBar months={months} onJump={jump} className="mb-4" />

          {list.error && !list.items.length ? (
            <EmptyState icon={BookImage} title="Couldn't load your memories" description={list.error.message} action={<Button onClick={() => list.reload()}>Try again</Button>} />
          ) : list.isLoading && !list.items.length ? (
            <MasonrySkeleton />
          ) : !list.items.length ? (
            filtered ? (
              <EmptyState icon={Search} title="Nothing matches" description="Try a different search or clear the filters." action={<Button variant="outline" onClick={() => (setSearch(""), setFavorite(false), setVideo(false), setAlbumId(null))}>Clear filters</Button>} />
            ) : (
              <EmptyState
                icon={Sparkles}
                title="Your first memory is waiting"
                description="A trip, a birthday, an ordinary Tuesday that felt special — save it here with photos and a few words."
                action={
                  <Button onClick={() => setDialog(true)}>
                    <Plus className="h-4 w-4" /> Save a memory
                  </Button>
                }
              />
            )
          ) : (
            <div className="space-y-8">
              {groups.map((y) => (
                <section key={y.year} aria-label={y.year}>
                  <h2 className="mb-3 font-display text-[24px] font-semibold text-fg">{y.year}</h2>
                  <div className="space-y-6">
                    {y.months.map((mg) => (
                      <div key={mg.key} id={`mem-${mg.key}`} className="scroll-mt-4">
                        <h3 className="mb-2.5 text-[13px] font-semibold tracking-wide text-fg-2 uppercase">{fmtMonth(mg.key, "MMMM")}</h3>
                        <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
                          {mg.items.map((m) => (
                            <MemoryCard key={m.id} memory={m} onToggleFavorite={toggleFavorite} className="mb-3" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <LoadMoreSentinel active={list.hasMore} loading={list.loadingMore} onVisible={list.loadMore} />
            </div>
          )}
        </>
      )}

      <MemoryDialog open={dialog} onOpenChange={setDialog} draft={albumId ? { albumId } : null} onSaved={() => void list.reload()} />
      <AlbumDialog open={albumDialog.open} onOpenChange={(o) => setAlbumDialog((s) => ({ ...s, open: o }))} album={albumDialog.album} onSaved={(a) => !albumDialog.album && openAlbum(a.id)} />
    </div>
  );
}

function FilterChip({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Heart; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
        active ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-fg-2 hover:text-fg",
      )}
    >
      <Icon className="h-3.5 w-3.5" fill={active && Icon === Heart ? "currentColor" : "none"} /> {label}
    </button>
  );
}

function AlbumsGrid({ albums, loading, onOpen, onNew }: { albums?: AlbumItem[]; loading: boolean; onOpen: (id: string) => void; onNew: () => void }) {
  if (loading && !albums)
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-[14px]" />
        ))}
      </div>
    );
  if (!albums?.length)
    return (
      <EmptyState
        icon={FolderPlus}
        title="Gather memories into albums"
        description="Trips, years, people — albums keep related moments together."
        action={
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" /> New album
          </Button>
        }
      />
    );
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {albums.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpen(a.id)}
          className="group overflow-hidden rounded-[14px] border border-line bg-surface text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div className="aspect-[4/3] bg-surface-2">
            {a.cover ? (
              <img src={a.cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-fg-3">
                <BookImage className="h-7 w-7" />
              </div>
            )}
          </div>
          <div className="px-3 py-2.5">
            <p className="line-clamp-1 font-display text-[15px] font-semibold text-fg">{a.title}</p>
            <p className="text-[12px] text-fg-3">
              {a.count} {a.count === 1 ? "memory" : "memories"}
            </p>
          </div>
        </button>
      ))}
      <button
        type="button"
        onClick={onNew}
        className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-line-strong text-[13.5px] font-medium text-fg-2 hover:border-primary hover:text-primary"
      >
        <Plus className="h-5 w-5" /> New album
      </button>
    </div>
  );
}
