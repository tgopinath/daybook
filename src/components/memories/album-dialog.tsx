"use client";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { SUMMARY_KEYS, api, refresh, useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { AlbumItem, MemoryPage } from "./types";

/** Create or rename an album; when editing, pick a cover from the album's photos. */
export function AlbumDialog({ open, onOpenChange, album, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; album?: AlbumItem | null; onSaved?: (a: AlbumItem) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data } = useApi<MemoryPage>(open && album ? `/api/memories?albumId=${album.id}&limit=60` : null);
  const images = useMemo(() => {
    const seen = new Set<string>();
    return (data?.items ?? []).flatMap((m) => m.media).filter((m) => m.kind === "image" && !seen.has(m.id) && seen.add(m.id));
  }, [data]);

  useEffect(() => {
    if (!open) return;
    setTitle(album?.title ?? "");
    setDescription(album?.description ?? "");
    setCover(album?.coverMediaId ?? null);
  }, [open, album]);

  const save = async () => {
    if (!title.trim()) return toast.error("Name the album");
    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim() || null, ...(album ? { coverMediaId: cover } : {}) };
      const res = album ? await api.patch<{ item: AlbumItem }>(`/api/albums/${album.id}`, payload) : await api.post<{ item: AlbumItem }>("/api/albums", payload);
      await refresh("/api/albums", "/api/memories", ...SUMMARY_KEYS);
      toast.success(album ? "Album updated" : "Album created");
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
      title={album ? "Edit album" : "New album"}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {album ? "Save" : "Create album"}
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
        <Field label="Name">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summer in Goa" autoFocus maxLength={120} />
        </Field>
        <Field label="Description (optional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
        </Field>
        {album && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg">Cover</p>
            {images.length === 0 ? (
              <p className="text-[12.5px] text-fg-2">Add memories with photos to this album to choose a cover. Until then, the newest memory&apos;s photo is used.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Album cover">
                <button
                  type="button"
                  role="radio"
                  aria-checked={cover === null}
                  onClick={() => setCover(null)}
                  className={cn("flex aspect-square items-center justify-center rounded-[10px] border p-1 text-center text-[11px] text-fg-2", cover === null ? "border-primary ring-2 ring-primary" : "border-line")}
                >
                  Newest photo
                </button>
                {images.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={cover === m.id}
                    aria-label={m.originalName ?? "Photo"}
                    onClick={() => setCover(m.id)}
                    className={cn("relative aspect-square overflow-hidden rounded-[10px]", cover === m.id && "ring-2 ring-primary ring-offset-2 ring-offset-surface")}
                  >
                    <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {cover === m.id && (
                      <span className="absolute right-1 bottom-1 rounded-full bg-primary p-0.5 text-on-primary">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
