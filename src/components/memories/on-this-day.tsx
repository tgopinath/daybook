"use client";
import Link from "next/link";
import { History } from "lucide-react";
import { useApi } from "@/lib/client";
import { yearsAgoLabel } from "./shared";
import type { MemoryItem, PhotoItem } from "./types";

/** "3 years ago today…" strip at the top of Memories. Hidden when there's nothing to show. */
export function OnThisDay() {
  const { data } = useApi<{ date: string; items: MemoryItem[]; photos: PhotoItem[] }>("/api/memories/on-this-day");
  if (!data || (!data.items.length && !data.photos.length)) return null;
  const photos = data.photos.filter((p) => p.media.kind === "image").slice(0, 8);
  return (
    <section aria-labelledby="otd-title" className="mb-6 rounded-[14px] border border-line bg-surface p-4 shadow-card">
      <h2 id="otd-title" className="flex items-center gap-2 font-display text-[18px] font-semibold text-fg">
        <History className="h-4 w-4 text-primary" /> On this day
      </h2>
      {data.items.length > 0 && (
        <ul className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1 scroll-thin">
          {data.items.map((m) => (
            <li key={m.id} className="w-[220px] shrink-0">
              <Link href={`/memories/${m.id}`} className="group block rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-surface-2">
                  {m.cover?.kind === "image" && <img src={m.cover.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />}
                  {m.cover?.kind === "video" && <video src={`${m.cover.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />}
                  <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11.5px] font-medium text-white">{yearsAgoLabel(m.yearsAgo ?? 1)}</span>
                </div>
                <p className="mt-2 line-clamp-1 font-display text-[15px] font-semibold text-fg">{m.title}</p>
                {m.caption && <p className="line-clamp-1 text-[12.5px] text-fg-2">{m.caption}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && (
        <div className="mt-3">
          <p className="text-[12.5px] text-fg-2">From your Photo Diary</p>
          <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 scroll-thin">
            {photos.map((p) => (
              <Link key={p.id} href="/photos" className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] bg-surface-2" aria-label={`${p.title}, ${yearsAgoLabel(p.yearsAgo ?? 1)}`}>
                <img src={p.media.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[10.5px] font-medium text-white">
                  {p.yearsAgo}y ago
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
