"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { format } from "date-fns";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { MonthCount } from "./types";

/** Parses a yyyy-MM-dd day key as a local date (no timezone shift). */
export function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
export const fmtDay = (day: string, pattern = "d MMM yyyy") => format(parseDay(day), pattern);
export const fmtMonth = (key: string, pattern = "MMMM yyyy") => format(parseDay(`${key}-01`), pattern);

export function yearsAgoLabel(n: number) {
  return n === 1 ? "1 year ago today" : `${n} years ago today`;
}

type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Cursor-paginated list (SWR infinite). The first page carries facets (months, tags, total).
 * `reload()` revalidates every loaded page; also call refresh() for other screens.
 */
export function usePaged<P extends Page<unknown>>(base: string | null) {
  const getKey = (index: number, prev: P | null) => {
    if (!base) return null;
    if (index === 0) return base;
    if (!prev?.nextCursor) return null;
    return `${base}${base.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(prev.nextCursor)}`;
  };
  const swr = useSWRInfinite<P>(getKey, (u: string) => api.get<P>(u), { revalidateFirstPage: true, revalidateOnFocus: true, keepPreviousData: true });
  const pages = swr.data ?? [];
  const items = pages.flatMap((p) => p.items) as P["items"];
  const last = pages[pages.length - 1];
  const hasMore = !!last?.nextCursor;
  const loadingMore = swr.isValidating && swr.size > pages.length;
  return {
    first: pages[0] as P | undefined,
    items,
    hasMore,
    loadingMore,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    loadMore: () => hasMore && !loadingMore && swr.setSize(swr.size + 1),
    setSize: swr.setSize,
    size: swr.size,
    reload: () => swr.mutate(),
    mutate: swr.mutate,
  };
}

/** Calls onVisible when the sentinel scrolls into view (infinite scroll). */
export function LoadMoreSentinel({ onVisible, active, loading }: { onVisible: () => void; active: boolean; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && onVisible(), { rootMargin: "600px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [active, onVisible]);
  if (!active) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      <button type="button" onClick={onVisible} className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-primary hover:bg-primary-soft">
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}

/**
 * Jump to a month section (`#<prefix>-yyyy-MM`). Loads more pages until it's on screen.
 */
export function useMonthJump(prefix: string, hasMore: boolean, size: number, setSize: (n: number) => unknown, loadedCount: number) {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(`${prefix}-${target}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTarget(null);
      return;
    }
    if (hasMore && size < 60) void setSize(size + 1);
    else setTarget(null);
  }, [target, prefix, hasMore, size, setSize, loadedCount]);
  return useCallback((key: string) => setTarget(key), []);
}

/** Horizontal year → month chips. */
export function MonthJumpBar({ months, onJump, className }: { months: MonthCount[]; onJump: (key: string) => void; className?: string }) {
  if (months.length < 2) return null;
  const years: { year: string; months: MonthCount[] }[] = [];
  for (const m of months) {
    const y = m.key.slice(0, 4);
    const last = years[years.length - 1];
    if (last?.year === y) last.months.push(m);
    else years.push({ year: y, months: [m] });
  }
  return (
    <nav aria-label="Jump to month" className={cn("-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 scroll-thin", className)}>
      {years.map((y) => (
        <div key={y.year} className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onJump(y.months[0]!.key)}
            className="h-7 rounded-lg px-2 font-display text-[14px] font-semibold text-fg hover:bg-surface-2"
          >
            {y.year}
          </button>
          {y.months.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onJump(m.key)}
              title={`${fmtMonth(m.key)} · ${m.count}`}
              className="h-7 rounded-lg border border-line px-2 text-[12px] text-fg-2 hover:border-line-strong hover:text-fg"
            >
              {fmtMonth(m.key, "MMM")}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        </div>
      ))}
    </nav>
  );
}

/** Debounced value for search boxes. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}
