"use client";
import { useState } from "react";
import Link from "next/link";
import { Heart, Images, MapPin, Play } from "lucide-react";
import { DemoBadge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { fmtDay } from "./shared";
import type { MemoryItem } from "./types";

/** Photo-first memory card for the masonry grid. The whole card is a link (Enter opens). */
export function MemoryCard({ memory, onToggleFavorite, className }: { memory: MemoryItem; onToggleFavorite?: (m: MemoryItem) => void; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const cover = memory.cover;
  const ratio = cover?.width && cover.height ? Math.min(Math.max(cover.width / cover.height, 0.66), 1.6) : 4 / 5;
  const extra = memory.media.length - 1;

  return (
    <article className={cn("group relative break-inside-avoid overflow-hidden rounded-[14px] border border-line bg-surface shadow-card transition-shadow hover:shadow-pop", className)}>
      <Link href={`/memories/${memory.id}`} className="block rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`${memory.title}, ${fmtDay(memory.day)}`}>
        {cover ? (
          <div className="relative w-full bg-surface-2" style={{ aspectRatio: String(ratio) }}>
            {cover.kind === "image" ? (
              <>
                {!loaded && <span className="skeleton absolute inset-0 rounded-none" />}
                <img src={cover.url} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded(true)} className="h-full w-full object-cover" />
              </>
            ) : (
              <video src={`${cover.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
            )}
            {(memory.hasVideo || extra > 0) && (
              <span className="absolute top-2 left-2 flex gap-1">
                {memory.hasVideo && (
                  <span className="flex items-center rounded-md bg-black/70 px-1.5 py-0.5 text-white" aria-label="Has video">
                    <Play className="h-3 w-3" fill="currentColor" />
                  </span>
                )}
                {extra > 0 && (
                  <span className="flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <Images className="h-3 w-3" /> +{extra}
                  </span>
                )}
              </span>
            )}
            {/* Solid scrim so the title stays readable over any photo */}
            <div className="absolute inset-x-0 bottom-0 bg-black/65 px-3 pt-2 pb-2.5 text-white">
              <h3 className="line-clamp-2 font-display text-[16px] leading-snug font-semibold">{memory.title}</h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px]">
                <span>{fmtDay(memory.day)}</span>
                {memory.location && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="flex min-w-0 items-center gap-0.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {memory.location}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-3.5">
            <p className="text-[12px] text-fg-3">{fmtDay(memory.day)}</p>
            <h3 className="mt-1 font-display text-[17px] leading-snug font-semibold text-fg">{memory.title}</h3>
            {memory.caption && <p className="mt-1.5 line-clamp-4 text-[14px] leading-relaxed text-fg-2">{memory.caption}</p>}
            {memory.location && (
              <p className="mt-2 flex items-center gap-1 text-[12px] text-fg-3">
                <MapPin className="h-3 w-3" /> {memory.location}
              </p>
            )}
          </div>
        )}
      </Link>
      <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1">
        <DemoBadge show={memory.isDemo} />
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(memory)}
            aria-pressed={memory.favorite}
            aria-label={memory.favorite ? "Remove from favourites" : "Add to favourites"}
            className={cn(
              "pointer-events-auto rounded-full p-1.5 transition-opacity",
              cover ? "bg-black/65 text-white" : "bg-surface-2 text-fg-2",
              memory.favorite ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
            )}
          >
            <Heart className="h-3.5 w-3.5" fill={memory.favorite ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    </article>
  );
}
