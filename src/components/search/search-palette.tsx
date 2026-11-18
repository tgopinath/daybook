"use client";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import {
  ArrowRight, Bell, CalendarDays, CheckSquare, Clock, CornerDownLeft, Loader2, Plus, Search, Settings, Shield, Sparkles, StickyNote, Target, X,
  type LucideIcon,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { ui, toggleAIPanel } from "@/lib/ui-store";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { Kbd } from "@/components/ui/misc";
import { toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type ResultType = "tasks" | "goals" | "reminders" | "notes" | "events" | "vault";
type Result = { id: string; title: string; subtitle: string; href: string };
type SearchResponse = {
  q: string;
  groups: { type: ResultType; label: string; items: Result[] }[];
  recent?: { id: string; query: string }[];
  quickActions?: { id: string; label: string; href?: string }[];
};

const FILTERS: { value: "" | ResultType; label: string }[] = [
  { value: "", label: "All" },
  { value: "tasks", label: "Tasks" },
  { value: "goals", label: "Goals" },
  { value: "reminders", label: "Reminders" },
  { value: "notes", label: "Notes" },
  { value: "events", label: "Events" },
  { value: "vault", label: "Personal info" },
];

const TYPE_ICONS: Record<ResultType, LucideIcon> = {
  tasks: CheckSquare,
  goals: Target,
  reminders: Bell,
  notes: StickyNote,
  events: CalendarDays,
  vault: Shield,
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  "new-task": Plus,
  "new-note": StickyNote,
  "open-calendar": CalendarDays,
  "ask-ai": Sparkles,
  "open-settings": Settings,
};

type Entry = { key: string; group: string; icon: LucideIcon; title: ReactNode; subtitle?: ReactNode; hint?: string; run: () => void };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const j = lower.indexOf(n, i);
    if (j < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={k++} className="rounded-sm bg-primary-soft px-0.5 text-primary">
        {text.slice(j, j + n.length)}
      </mark>,
    );
    i = j + n.length;
  }
  return <>{parts}</>;
}

export function SearchPalette() {
  const { searchOpen } = ui.use();
  const close = () => ui.set({ searchOpen: false });
  return (
    <D.Root open={searchOpen} onOpenChange={(o) => ui.set({ searchOpen: o })}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_.15s_ease-out]" />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-3 top-3 z-50 flex max-h-[min(640px,calc(100dvh-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-modal outline-none",
            "sm:inset-x-auto sm:top-[12vh] sm:left-1/2 sm:w-[640px] sm:-translate-x-1/2",
            "data-[state=open]:animate-[popIn_.14s_ease-out]",
          )}
        >
          <D.Title className="sr-only">Search</D.Title>
          {searchOpen && <Palette onClose={close} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"" | ResultType>("");
  const [active, setActive] = useState(0);
  const dq = useDebounced(q.trim(), 150);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const url = dq ? `/api/search?q=${encodeURIComponent(dq)}${filter ? `&types=${filter}` : ""}` : "/api/search";
  const { data, isValidating, error, mutate } = useApi<SearchResponse>(url, { revalidateOnFocus: false, dedupingInterval: 2000 });
  const fresh = data && data.q === dq;
  const pending = q.trim() !== dq || (isValidating && !fresh);

  const remember = (query: string) => {
    if (query) void api.post("/api/search/recent", { query }).catch(() => {});
  };

  const openResult = (type: ResultType, r: Result) => {
    remember(dq);
    onClose();
    if (type === "tasks") openTaskDialog({ id: r.id });
    else router.push(r.href);
  };

  const runAction = (id: string, href?: string) => {
    onClose();
    if (id === "new-task") openTaskDialog();
    else if (id === "ask-ai") toggleAIPanel(true);
    else if (href) router.push(href);
  };

  const clearRecent = async () => {
    try {
      await api.delete("/api/search/recent");
      await mutate();
      inputRef.current?.focus();
    } catch (err) {
      toastError(err);
    }
  };

  const entries = useMemo<Entry[]>(() => {
    if (!data) return [];
    if (!dq) {
      if (data.q) return [];
      const recent: Entry[] = (data.recent ?? []).map((r) => ({
        key: `r:${r.id}`,
        group: "Recent searches",
        icon: Clock,
        title: r.query,
        run: () => {
          setQ(r.query);
          inputRef.current?.focus();
        },
      }));
      const actions: Entry[] = (data.quickActions ?? []).map((a) => ({
        key: `a:${a.id}`,
        group: "Quick actions",
        icon: ACTION_ICONS[a.id] ?? ArrowRight,
        title: a.label,
        run: () => runAction(a.id, a.href),
      }));
      return [...recent, ...actions];
    }
    return data.groups.flatMap((g) =>
      g.items.map((r) => ({
        key: `${g.type}:${r.id}`,
        group: g.label,
        icon: TYPE_ICONS[g.type],
        title: <Highlight text={r.title} q={data.q} />,
        subtitle: r.subtitle ? <Highlight text={r.subtitle} q={data.q} /> : undefined,
        hint: g.type === "tasks" ? "Open" : "Go to",
        run: () => openResult(g.type, r),
      })),
    );
  }, [data, dq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(0), [data, dq, filter]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (entries.length ? (a + 1) % entries.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (entries.length ? (a - 1 + entries.length) % entries.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      entries[active]?.run();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = FILTERS.findIndex((f) => f.value === filter);
      const next = (i + (e.shiftKey ? -1 : 1) + FILTERS.length) % FILTERS.length;
      setFilter(FILTERS[next]!.value);
    }
  };

  let lastGroup = "";
  const showNoResults = !!dq && fresh && !pending && entries.length === 0;

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-3" /> : <Search className="h-4 w-4 shrink-0 text-fg-3" />}
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks, goals, notes, events…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={entries[active] ? `search-opt-${active}` : undefined}
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
        />
        {q ? (
          <button onClick={() => (setQ(""), inputRef.current?.focus())} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="hidden sm:inline-flex">
            <Kbd>Esc</Kbd>
          </span>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2 scroll-thin" role="tablist" aria-label="Filter results">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            role="tab"
            tabIndex={-1}
            aria-selected={filter === f.value}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFilter(f.value)}
            className={cn(
              "h-7 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors",
              filter === f.value ? "bg-fg text-surface" : "bg-surface-2 text-fg-2 hover:text-fg",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div ref={listRef} id="search-results" role="listbox" aria-label="Results" className="min-h-[120px] flex-1 overflow-y-auto p-2 scroll-thin">
        {error && !data && <p className="px-3 py-8 text-center text-sm text-danger">Search isn&apos;t available right now. {error.message}</p>}
        {!data && !error && (
          <div className="flex flex-col gap-1.5 p-1" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        )}
        {showNoResults && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <Search className="mb-3 h-5 w-5 text-fg-3" />
            <p className="text-[14px] font-medium">No results for &ldquo;{dq}&rdquo;</p>
            <p className="mt-1 text-[13px] text-fg-3">{filter ? "Try searching all categories." : "Try a different word or check the spelling."}</p>
            {filter && (
              <button onClick={() => setFilter("")} className="mt-3 text-[13px] font-medium text-primary hover:underline">
                Search everything
              </button>
            )}
          </div>
        )}
        <div className={cn(pending && entries.length > 0 && "opacity-60 transition-opacity")}>
          {entries.map((e, idx) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            const Icon = e.icon;
            return (
              <Fragment key={e.key}>
                {header && (
                  <div className="flex items-center justify-between px-3 pt-3 pb-1.5 first:pt-1">
                    <span className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{header}</span>
                    {header === "Recent searches" && (
                      <button onClick={clearRecent} className="text-[11.5px] font-medium text-fg-3 hover:text-fg">
                        Clear
                      </button>
                    )}
                  </div>
                )}
                <div
                  id={`search-opt-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  onMouseMove={() => idx !== active && setActive(idx)}
                  onClick={() => e.run()}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2", idx === active ? "bg-surface-2" : "")}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", idx === active ? "bg-surface text-primary shadow-card" : "bg-surface-2 text-fg-2")}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px]">{e.title}</div>
                    {e.subtitle && <div className="truncate text-[12px] text-fg-3">{e.subtitle}</div>}
                  </div>
                  {idx === active && (
                    <span className="hidden shrink-0 items-center gap-1 text-[11.5px] text-fg-3 sm:flex">
                      {e.hint} <CornerDownLeft className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11.5px] text-fg-3 sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Tab</Kbd> filter
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </div>
  );
}
