"use client";
import { useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { toastError } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { fmtDay } from "@/components/memories/shared";
import type { PhotoItem } from "@/components/memories/types";

const stop = (e: React.KeyboardEvent) => e.stopPropagation(); // keep ←/→ for the text field, not the viewer

/** Caption / date / tags editor shown under a photo in the full-screen viewer (dark background). */
export function PhotoCaption({ photo, onChanged }: { photo: PhotoItem; onChanged: () => void }) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [tag, setTag] = useState("");
  useEffect(() => {
    setCaption(photo.caption ?? "");
    setTag("");
  }, [photo.id, photo.caption]);

  const save = async (data: Record<string, unknown>) => {
    try {
      await api.patch(`/api/photos/${photo.id}`, data);
      onChanged();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => {
            stop(e);
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          onBlur={() => caption.trim() !== (photo.caption ?? "") && void save({ caption: caption.trim() || null })}
          placeholder="Add a caption…"
          aria-label="Caption"
          maxLength={2000}
          className="h-9 min-w-0 flex-1 rounded-lg border border-white/30 bg-black/40 px-3 text-[14px] text-white placeholder:text-white/80 focus:border-white focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void save({ favorite: !photo.favorite })}
          aria-pressed={photo.favorite}
          aria-label={photo.favorite ? "Remove from favourites" : "Add to favourites"}
          className="rounded-lg p-2 text-white hover:bg-white/10"
        >
          <Heart className="h-5 w-5" fill={photo.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-white">
        <label className="inline-flex items-center gap-1">
          <span className="sr-only">Date taken</span>
          <input
            type="date"
            value={photo.takenOn}
            onKeyDown={stop}
            onChange={(e) => e.target.value && void save({ takenOn: e.target.value })}
            className="h-7 rounded-md border border-white/30 bg-black/40 px-1.5 text-[12.5px] text-white [color-scheme:dark]"
            title={fmtDay(photo.takenOn)}
          />
        </label>
        {photo.collection && <span className="rounded-md bg-white/15 px-1.5 py-0.5">{photo.collection.title}</span>}
        {photo.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-white/15 py-0.5 pr-1 pl-2">
            #{t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => void save({ tags: photo.tags.filter((x) => x !== t) })} className="rounded-full p-0.5 hover:bg-white/20">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            stop(e);
            if ((e.key === "Enter" || e.key === ",") && tag.trim()) {
              e.preventDefault();
              void save({ tags: [...photo.tags, tag.trim()] });
              setTag("");
            }
          }}
          placeholder="+ tag"
          aria-label="Add tag"
          className="h-7 w-24 rounded-md border border-white/30 bg-black/40 px-2 text-[12.5px] text-white placeholder:text-white/80 focus:border-white focus:outline-none"
        />
      </div>
    </div>
  );
}
