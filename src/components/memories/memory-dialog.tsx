"use client";
import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb, MediaUploader } from "@/components/media/media";
import { SUMMARY_KEYS, api, refresh, useApi } from "@/lib/client";
import { ACCEPT, type Media } from "@/lib/upload";
import { dayKey, browserTz } from "@/lib/time";
import type { AlbumItem, MemoryItem } from "./types";

export type MemoryDraft = Partial<Pick<MemoryItem, "title" | "caption" | "day" | "location" | "latitude" | "longitude" | "albumId" | "favorite">> & { media?: Media[] };

function SortableMedia({ media, index, onRemove }: { media: Media; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      <MediaThumb media={media} alt={media.originalName ?? ""} />
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${media.originalName ?? "item"} (position ${index + 1})`}
        className="absolute top-1.5 left-1.5 cursor-grab touch-none rounded-md bg-black/65 p-1 text-white active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onRemove} aria-label="Remove from memory" className="absolute top-1.5 right-1.5 rounded-full bg-black/65 p-1 text-white hover:bg-black/80">
        <X className="h-3.5 w-3.5" />
      </button>
      {index === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">Cover</span>}
    </div>
  );
}

/** Create or edit a memory. `memory` = edit; `draft` pre-fills a new one (e.g. from selected photos). */
export function MemoryDialog({
  open,
  onOpenChange,
  memory,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memory?: MemoryItem | null;
  draft?: MemoryDraft | null;
  onSaved?: (m: MemoryItem) => void;
}) {
  const { data: albums } = useApi<{ items: AlbumItem[] }>(open ? "/api/albums" : null);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [showCoords, setShowCoords] = useState(false);
  const [albumId, setAlbumId] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [saving, setSaving] = useState(false);
  const [newAlbum, setNewAlbum] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const src = memory ?? draft ?? {};
    setTitle(src.title ?? "");
    setDay(src.day ?? dayKey(new Date(), browserTz()));
    setCaption(src.caption ?? "");
    setLocation(src.location ?? "");
    setLat(src.latitude != null ? String(src.latitude) : "");
    setLng(src.longitude != null ? String(src.longitude) : "");
    setShowCoords(src.latitude != null);
    setAlbumId(src.albumId ?? "");
    setFavorite(src.favorite ?? false);
    setMedia(src.media ?? []);
    setNewAlbum(null);
  }, [open, memory, draft]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setMedia((list) => arrayMove(list, list.findIndex((m) => m.id === e.active.id), list.findIndex((m) => m.id === e.over!.id)));
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Give this memory a title");
    const latitude = lat.trim() ? Number(lat) : null;
    const longitude = lng.trim() ? Number(lng) : null;
    if ((latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude !== null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180)))
      return toast.error("Coordinates look off — latitude is −90 to 90, longitude −180 to 180");
    setSaving(true);
    try {
      let album = albumId || null;
      if (newAlbum !== null && newAlbum.trim()) {
        const res = await api.post<{ item: AlbumItem }>("/api/albums", { title: newAlbum.trim() });
        album = res.item.id;
        void refresh("/api/albums");
      }
      const payload = { title: title.trim(), caption: caption.trim() || null, date: day, location: location.trim() || null, latitude, longitude, albumId: album, favorite, mediaIds: media.map((m) => m.id) };
      const res = memory ? await api.patch<{ item: MemoryItem }>(`/api/memories/${memory.id}`, payload) : await api.post<{ item: MemoryItem }>("/api/memories", payload);
      await refresh("/api/memories", "/api/albums", ...SUMMARY_KEYS);
      toast.success(memory ? "Memory updated" : "Memory saved");
      onSaved?.(res.item);
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={memory ? "Edit memory" : "New memory"}
      description={memory ? undefined : "A moment worth keeping — add photos, a few words, and where it happened."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {memory ? "Save changes" : "Save memory"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunset at the lake" maxLength={200} autoFocus className="font-display text-[16px]" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
          </Field>
          <Field label="Album">
            {newAlbum === null ? (
              <Select
                value={albumId}
                onChange={(e) => {
                  if (e.target.value === "__new") setNewAlbum("");
                  else setAlbumId(e.target.value);
                }}
              >
                <option value="">No album</option>
                {albums?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
                <option value="__new">+ New album…</option>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} placeholder="Album name" autoFocus maxLength={120} />
                <Button variant="ghost" size="sm" onClick={() => setNewAlbum(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </Field>
        </div>
        <Field label="Where">
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ooty, Tamil Nadu" maxLength={200} className="pl-9" />
          </div>
        </Field>
        {showCoords ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude">
              <Input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="11.4102" />
            </Field>
            <Field label="Longitude">
              <Input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="76.6950" />
            </Field>
          </div>
        ) : (
          <button type="button" onClick={() => setShowCoords(true)} className="text-[12.5px] font-medium text-primary hover:underline">
            Add map coordinates (optional)
          </button>
        )}
        <Field label="The story">
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="What made this moment special?" maxLength={5000} />
        </Field>
        <div>
          <p className="mb-1.5 text-[14px] font-medium text-fg">Photos & videos</p>
          {media.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={media.map((m) => m.id)} strategy={rectSortingStrategy}>
                <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {media.map((m, i) => (
                    <SortableMedia key={m.id} media={m} index={i} onRemove={() => setMedia((l) => l.filter((x) => x.id !== m.id))} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <MediaUploader
            accept={ACCEPT.imagesAndVideos}
            label={media.length ? "Add more" : "Add photos or videos"}
            onUploaded={(m) => setMedia((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]))}
          />
          {media.length > 1 && <p className="mt-1.5 text-[12px] text-fg-3">Drag to reorder — the first one is the cover.</p>}
        </div>
        <Switch checked={favorite} onChange={setFavorite} label="Favourite" />
      </form>
    </Dialog>
  );
}
