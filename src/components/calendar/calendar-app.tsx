"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "framer-motion";
import { AlertCircle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Columns3, LayoutGrid, List, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { useMe, useTz } from "@/lib/use-me";
import { dayKey } from "@/lib/time";
import { overrides } from "./actions";
import { AgendaView } from "./agenda-view";
import { openEventDialog } from "./event-dialog";
import { openItem } from "./item-chip";
import { MiniMonth } from "./mini-month";
import { MonthView } from "./month-view";
import { LayerToggles, SidePanel } from "./side-panel";
import { TimeGrid } from "./time-grid";
import type { CalItem, CalView, CalendarFeed, Layers } from "./types";
import { buildItems, isoRange, stepAnchor, viewDays, viewTitle } from "./utils";

const VIEW_KEY = "daybook.calendar.view";
const LAYERS_KEY = "daybook.calendar.layers";
const VIEWS: { value: CalView; label: string; icon: typeof Square }[] = [
  { value: "day", label: "Day", icon: Square },
  { value: "week", label: "Week", icon: Columns3 },
  { value: "month", label: "Month", icon: LayoutGrid },
  { value: "agenda", label: "Agenda", icon: List },
];

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 767px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mobile;
}

export function CalendarApp() {
  const router = useRouter();
  const tz = useTz();
  const { data: me } = useMe();
  const weekStart = me?.settings.weekStart ?? 1;
  const workStart = me?.settings.workStart ?? "09:00";
  const workEnd = me?.settings.workEnd ?? "18:00";
  const isMobile = useIsMobile();

  const [todayKey, setTodayKey] = useState(() => dayKey(new Date(), tz));
  const [anchor, setAnchor] = useState(todayKey);
  const [view, setViewState] = useState<CalView>("week");
  const [layers, setLayersState] = useState<Layers>({ events: true, tasks: true, reminders: true });
  const [agendaDays, setAgendaDays] = useState(30);
  const [dir, setDir] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tzRef = useRef(tz);

  // Restore view + layers (mobile defaults to Agenda).
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as CalView | null;
      if (v && VIEWS.some((x) => x.value === v)) setViewState(v);
      else if (window.innerWidth < 768) setViewState("agenda");
      const l = localStorage.getItem(LAYERS_KEY);
      if (l) setLayersState({ events: true, tasks: true, reminders: true, ...JSON.parse(l) });
      // Deep link from the dashboard / search: /calendar?date=yyyy-MM-dd opens that day.
      const date = new URLSearchParams(window.location.search).get("date");
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setAnchor(date);
        setViewState("day");
      }
    } catch {}
  }, []);

  // Keep "today" correct across midnight and when the user's timezone loads.
  useEffect(() => {
    const k = dayKey(new Date(), tz);
    if (tzRef.current !== tz) {
      tzRef.current = tz;
      setAnchor(k);
    }
    setTodayKey(k);
    const h = setInterval(() => setTodayKey(dayKey(new Date(), tz)), 60_000);
    return () => clearInterval(h);
  }, [tz]);

  const setView = useCallback((v: CalView) => {
    setViewState(v);
    setDir(0);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);
  const setLayers = useCallback((l: Layers) => {
    setLayersState(l);
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(l));
    } catch {}
  }, []);

  const go = useCallback(
    (d: 1 | -1) => {
      setDir(d);
      setAnchor((a) => stepAnchor(view, a, d));
      setAgendaDays(30);
    },
    [view],
  );
  const goToday = useCallback(() => {
    setDir(0);
    setAnchor(todayKey);
    setAgendaDays(30);
  }, [todayKey]);
  const openDay = useCallback(
    (k: string) => {
      setAnchor(k);
      setView("day");
    },
    [setView],
  );

  const days = useMemo(() => viewDays(view, anchor, weekStart, agendaDays), [view, anchor, weekStart, agendaDays]);
  const { from, to } = useMemo(() => isoRange(days, tz), [days, tz]);
  const { data: feed, error, isLoading, isValidating, mutate } = useApi<CalendarFeed>(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

  const { map: ov } = overrides.use();
  const items = useMemo<CalItem[]>(
    () => buildItems(feed, tz, layers).map((it) => (ov[it.key] ? { ...it, start: ov[it.key]!.start, end: ov[it.key]!.end } : it)),
    [feed, tz, layers, ov],
  );
  const onOpen = useCallback((it: CalItem) => openItem(it, (href) => router.push(href)), [router]);

  // Keyboard: t = today, d/w/m/a = views, ←/→ or j/k = previous/next.
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // "g <letter>" is the app-wide jump shortcut; don't treat the letter as a calendar key.
      if (e.key.toLowerCase() === "g") return void (gAt = Date.now());
      if (Date.now() - gAt < 800) return void (gAt = 0);
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "t") goToday();
      else if (k === "d") setView("day");
      else if (k === "w") setView("week");
      else if (k === "m") setView("month");
      else if (k === "a") setView("agenda");
      else if (e.key === "ArrowLeft" || k === "k") go(-1);
      else if (e.key === "ArrowRight" || k === "j") go(1);
      else if (k === "c") openEventDialog();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goToday, setView]);

  const swipe = isMobile && view !== "week";
  const title = viewTitle(view, anchor, weekStart);
  const dayLabel = view === "day" ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${anchor}T12:00:00Z`)) : null;

  let body: React.ReactNode;
  if (error && !feed) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-14 text-center shadow-card">
        <AlertCircle className="h-6 w-6 text-danger" />
        <p className="text-sm text-fg-2">Couldn&apos;t load your calendar.</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          Try again
        </Button>
      </div>
    );
  } else if (!feed && isLoading) {
    body = <CalendarSkeleton view={view} />;
  } else if (view === "month") {
    body = <MonthView days={days} anchor={anchor} items={items} tz={tz} todayKey={todayKey} workStart={workStart} onOpen={onOpen} onOpenDay={openDay} />;
  } else if (view === "agenda") {
    body = <AgendaView days={days} items={items} tz={tz} todayKey={todayKey} onOpen={onOpen} onLoadMore={() => setAgendaDays((n) => n + 30)} loadingMore={isValidating} />;
  } else {
    body = <TimeGrid days={days} items={items} tz={tz} todayKey={todayKey} workStart={workStart} workEnd={workEnd} onOpen={onOpen} onOpenDay={openDay} />;
  }

  return (
    <div className="flex gap-6">
      <SidePanel anchor={anchor} todayKey={todayKey} weekStart={weekStart} tz={tz} layers={layers} onLayers={setLayers} onSelectDay={(k) => setAnchor(k)} highlightWeek={view === "week"} />

      <div className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen}>
              <Popover.Trigger asChild>
                <button type="button" className="group -ml-1.5 flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-left hover:bg-surface-2" aria-label="Jump to date">
                  <h1 className="truncate text-[22px] font-semibold tracking-tight">{title}</h1>
                  {dayLabel && <span className="hidden pt-1 text-[14px] text-fg-3 sm:inline">{dayLabel}</span>}
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-fg-3 transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" sideOffset={6} className="z-[60] w-[260px] rounded-xl border border-line bg-surface p-3 shadow-pop">
                  <MiniMonth
                    value={anchor}
                    todayKey={todayKey}
                    weekStart={weekStart}
                    highlightWeek={view === "week"}
                    onSelect={(k) => {
                      setAnchor(k);
                      setDir(0);
                      setPickerOpen(false);
                    }}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <div className="ml-auto flex shrink-0 items-center gap-1 md:hidden">
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button size="icon-sm" aria-label="New event" onClick={() => openEventDialog()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 md:ml-auto">
            <Button variant="outline" size="sm" onClick={goToday} className="hidden md:inline-flex" title="Today (T)">
              Today
            </Button>
            <div className="flex items-center">
              <Button variant="ghost" size="icon-sm" aria-label="Previous" title="Previous (←)" onClick={() => go(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next" title="Next (→)" onClick={() => go(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Segmented value={view} onChange={setView} options={VIEWS.map(({ value, label }) => ({ value, label }))} size="sm" className="ml-auto md:ml-0" />
            <Button size="sm" onClick={() => openEventDialog()} className="hidden md:inline-flex lg:hidden">
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
        </div>

        {/* Legend + layer filters (desktop has them in the side panel) */}
        <div className="mb-3 lg:hidden">
          <LayerToggles layers={layers} onChange={setLayers} compact />
        </div>

        <motion.div
          key={`${view}:${anchor}`}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          drag={swipe ? "x" : false}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            if (info.offset.x < -70 || info.velocity.x < -500) go(1);
            else if (info.offset.x > 70 || info.velocity.x > 500) go(-1);
          }}
        >
          {body}
        </motion.div>

        {feed && !layers.events && !layers.tasks && !layers.reminders && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-fg-3">
            <CalendarDays className="h-3.5 w-3.5" /> All layers are hidden. Turn on Events, Tasks or Reminders to see items.
          </p>
        )}
      </div>

    </div>
  );
}

function CalendarSkeleton({ view }: { view: CalView }) {
  if (view === "agenda") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading calendar">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[14px] border border-line bg-surface p-4 shadow-card">
            <Skeleton className="mb-3 h-4 w-32" />
            <Skeleton className="mb-2 h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ))}
      </div>
    );
  }
  if (view === "month") {
    return (
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[14px] border border-line bg-line shadow-card" aria-busy="true" aria-label="Loading calendar">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="flex min-h-[74px] flex-col gap-1.5 bg-surface p-2 sm:min-h-[118px]">
            <Skeleton className="h-4 w-5" />
            {i % 3 === 0 && <Skeleton className="hidden h-4 w-full sm:block" />}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="h-[calc(100dvh-300px)] min-h-[440px] rounded-[14px] border border-line bg-surface p-4 shadow-card md:h-[calc(100dvh-210px)]" aria-busy="true" aria-label="Loading calendar">
      <Skeleton className="mb-4 h-6 w-full" />
      <div className="flex flex-col gap-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-3 w-10" />
            <Skeleton className={i % 2 ? "h-12 w-1/3" : "h-8 w-1/4"} />
          </div>
        ))}
      </div>
    </div>
  );
}
