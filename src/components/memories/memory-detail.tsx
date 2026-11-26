"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, BookImage, CalendarDays, FolderOpen, Heart, MapPin, MoreHorizontal, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Badge, DemoBadge, EmptyState, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb, MediaViewer } from "@/components/media/media";
import { GooglePhotosImport } from "@/components/google-photos/import-button";
import { SUMMARY_KEYS, api, refresh, useApi } from "@/lib/client";
import { MemoryDialog } from "./memory-dialog";
import { fmtDay } from "./shared";
import type { MemoryItem } from "./types";

export function MemoryDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useApi<{ item: MemoryItem }>(`/api/memories/${id}`);
  const [viewer, setViewer] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const m = data?.item;

  const sync = async () => {
    await mutate();
    await refresh("/api/memories", "/api/albums", ...SUMMARY_KEYS);
  };
  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      await api.patch(`/api/memories/${id}`, body);
      await sync();
      if (msg) toast.success(msg);
    } catch (err) {
      toastError(err);
    }
  };

  const softDelete = async () => {
    try {
      await api.delete(`/api/memories/${id}`);
      await refresh("/api/memories", "/api/albums", ...SUMMARY_KEYS);
      toast.undo("Memory moved to Trash", async () => {
        try {
          await api.patch(`/api/memories/${id}`, { deletedAt: null });
          await refresh("/api/memories", "/api/albums", ...SUMMARY_KEYS);
          toast.success("Memory restored");
        } catch (err) {
          toastError(err);
        }
      });
      router.push("/memories");
    } catch (err) {
      toastError(err);
    }
  };

  const destroy = async () => {
    const ok = await confirm({
      title: "Delete this memory forever?",
      body: "The memory and any photos or videos used only by it will be permanently deleted. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    try {
      await api.delete(`/api/memories/${id}?permanent=1`);
      await refresh("/api/memories", "/api/albums", "/api/media", ...SUMMARY_KEYS);
      toast.success("Memory deleted");
      router.push("/memories");
    } catch (err) {
      toastError(err);
    }
  };

  if (error)
    return (
      <EmptyState
        icon={BookImage}
        title={error.message.includes("not found") ? "This memory isn't here" : "Couldn't load this memory"}
        description={error.message}
        action={
          <Link href="/memories" className="text-[14px] font-medium text-primary hover:underline">
            Back to Memories
          </Link>
        }
      />
    );
  if (isLoading || !m)
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="aspect-[16/10] w-full rounded-[14px]" />
      </div>
    );

  const items = m.media;
  const hero = items[0];
  const rest = items.slice(1);
  const menu: MenuItem[] = m.deletedAt
    ? [
        { label: "Restore", icon: RotateCcw, onSelect: () => void patch({ deletedAt: null }, "Memory restored") },
        { type: "separator" },
        { label: "Delete forever", icon: Trash2, danger: true, onSelect: () => void destroy() },
      ]
    : [
        m.archivedAt
          ? { label: "Unarchive", icon: ArchiveRestore, onSelect: () => void patch({ archived: false }, "Memory unarchived") }
          : { label: "Archive", icon: Archive, onSelect: () => void patch({ archived: true }, "Memory archived") },
        { type: "separator" },
        { label: "Move to Trash", icon: Trash2, danger: true, onSelect: () => void softDelete() },
        { label: "Delete forever", icon: Trash2, danger: true, onSelect: () => void destroy() },
      ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/memories" className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-fg-2 hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Memories
      </Link>

      {(m.deletedAt || m.archivedAt) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-fg">
          <span>{m.deletedAt ? "This memory is in the Trash." : "This memory is archived — it's hidden from your timeline."}</span>
          <Button size="sm" variant="outline" onClick={() => void patch(m.deletedAt ? { deletedAt: null } : { archived: false }, m.deletedAt ? "Memory restored" : "Memory unarchived")}>
            {m.deletedAt ? "Restore" : "Unarchive"}
          </Button>
        </div>
      )}

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight font-semibold text-fg">{m.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-2">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {fmtDay(m.day, "EEEE, d MMMM yyyy")}
            </span>
            {m.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {m.latitude != null && m.longitude != null ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=14/${m.latitude}/${m.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-fg"
                  >
                    {m.location}
                  </a>
                ) : (
                  m.location
                )}
              </span>
            )}
            {m.album && (
              <span className="inline-flex items-center gap-1">
                <FolderOpen className="h-3.5 w-3.5" /> {m.album.title}
              </span>
            )}
            <DemoBadge show={m.isDemo} />
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-pressed={m.favorite}
            aria-label={m.favorite ? "Remove from favourites" : "Add to favourites"}
            onClick={() => void patch({ favorite: !m.favorite })}
            className={m.favorite ? "text-primary" : undefined}
          >
            <Heart className="h-4 w-4" fill={m.favorite ? "currentColor" : "none"} />
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Menu
            trigger={
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            items={menu}
          />
        </div>
      </header>

      {hero ? (
        <button type="button" onClick={() => setViewer(0)} className="relative block w-full overflow-hidden rounded-[14px] bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Open photo viewer">
          {hero.kind === "image" ? (
            <img src={hero.url} alt={m.title} className="max-h-[70vh] w-full object-cover" />
          ) : (
            <>
              <video src={`${hero.url}#t=0.1`} preload="metadata" muted playsInline className="max-h-[70vh] w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/65 text-white">
                  <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
                </span>
              </span>
            </>
          )}
        </button>
      ) : null}

      {m.caption && <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-wrap text-fg">{m.caption}</p>}

      {rest.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {rest.map((x, i) => (
            <MediaThumb key={x.id} media={x} alt={x.originalName ?? ""} onClick={() => setViewer(i + 1)} />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {!m.deletedAt && <GooglePhotosImport target="memory" memoryId={m.id} returnPath={`/memories/${m.id}`} size="sm" label="Add from Google Photos" onImported={() => void sync()} />}
        {items.length > 0 && <Badge>{items.length} {items.length === 1 ? "item" : "items"}</Badge>}
        {!items.length && (
          <button type="button" onClick={() => setEditing(true)} className="text-[14px] font-medium text-primary hover:underline">
            Add photos or videos
          </button>
        )}
      </div>

      <MediaViewer
        items={items}
        index={viewer}
        onIndexChange={setViewer}
        caption={() => (
          <span>
            <span className="font-display font-semibold">{m.title}</span>
            <span> · {fmtDay(m.day)}</span>
            {m.location && <span> · {m.location}</span>}
          </span>
        )}
      />
      <MemoryDialog open={editing} onOpenChange={setEditing} memory={m} onSaved={() => void mutate()} />
    </div>
  );
}
