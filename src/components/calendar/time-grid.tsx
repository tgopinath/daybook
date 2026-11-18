"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addDaysKey, weekdayOfKey } from "@/lib/time";
import { moveEvent, toggleTask } from "./actions";
import { openEventDialog } from "./event-dialog";
import { ItemChip, KindIcon, isDone } from "./item-chip";
import type { CalItem } from "./types";
import { useDayDrag } from "./use-day-drag";
import { HOUR_PX, SNAP_MIN, formatKey, formatTime, formatTimeRange, isAllDayLike, itemDayKeys, keyMinutesToMs, layoutOverlaps, minutesOfDay, startOfDayMs, tint } from "./utils";

const PX_PER_MIN = HOUR_PX / 60;
const GUTTER = 52;
const LANE_LIMIT = 3;

type Seg = { item: CalItem; key: string; s: number; e: number; segStart: number; segEnd: number; isStart: boolean; isEnd: boolean };

type Drag =
  | { mode: "create"; day: string; a: number; b: number; pointerId: number }
  | { mode: "move"; item: Extract<CalItem, { type: "event" }>; grabMin: number; day: string; startMin: number; moved: boolean; x: number; y: number; pointerId: number }
  | { mode: "resize"; item: Extract<CalItem, { type: "event" }>; day: string; endMin: number; pointerId: number };

const snap = (m: number, step = SNAP_MIN) => Math.round(m / step) * step;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function TimeGrid({
  days,
  items,
  tz,
  todayKey,
  workStart,
  workEnd,
  onOpen,
  onOpenDay,
}: {
  days: string[];
  items: CalItem[];
  tz: string;
  todayKey: string;
  workStart: string;
  workEnd: string;
  onOpen: (item: CalItem) => void;
  onOpenDay: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const suppressClick = useRef(false);
  const [laneOpen, setLaneOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const laneDrag = useDayDrag(tz);
  const multi = days.length > 1;

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(h);
  }, []);

  // Scroll to "now" (or the start of the working day) when the visible days change.
  const daysSig = days.join(",");
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = days.includes(todayKey) ? minutesOfDay(Date.now(), tz) - 120 : toMin(workStart) - 60;
    el.scrollTop = Math.max(0, target * PX_PER_MIN);
  }, [daysSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Split items into the all-day lane and timed segments per day.
  const { lane, segs } = useMemo(() => {
    const lane = new Map<string, CalItem[]>();
    const segs = new Map<string, Seg[]>();
    const daySet = new Set(days);
    for (const it of items) {
      if (isAllDayLike(it, tz)) {
        for (const k of itemDayKeys(it, tz)) if (daySet.has(k)) (lane.get(k) ?? lane.set(k, []).get(k)!).push(it);
        continue;
      }
      for (const k of itemDayKeys(it, tz)) {
        if (!daySet.has(k)) continue;
        const ds = startOfDayMs(k, tz);
        const de = startOfDayMs(addDaysKey(k, 1), tz);
        const segStart = Math.max(it.start, ds);
        const segEnd = Math.min(Math.max(it.end, it.start + 15 * 60000), de);
        const s = (segStart - ds) / 60000;
        const e = Math.max(s + 15, (segEnd - ds) / 60000);
        (segs.get(k) ?? segs.set(k, []).get(k)!).push({ item: it, key: it.key, s, e, segStart, segEnd, isStart: it.start >= ds, isEnd: it.end <= de });
      }
    }
    for (const list of lane.values()) list.sort((a, b) => (a.type === "event" ? 0 : a.type === "task" ? 1 : 2) - (b.type === "event" ? 0 : b.type === "task" ? 1 : 2) || a.start - b.start);
    return { lane, segs };
  }, [items, days, tz]);

  const laneMax = Math.max(0, ...days.map((k) => lane.get(k)?.length ?? 0));

  /** Pointer position → (day, minutes) using the column rectangles. */
  function locate(clientX: number, clientY: number): { day: string; min: number } | null {
    let best: { day: string; min: number } | null = null;
    for (const k of days) {
      const el = colRefs.current.get(k);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const min = (clientY - r.top) / PX_PER_MIN;
      if (clientX >= r.left && clientX < r.right) return { day: k, min };
      if (clientX < r.left && !best) best = { day: k, min };
      if (clientX >= r.right) best = { day: k, min };
    }
    return best;
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const loc = locate(e.clientX, e.clientY);
      if (!loc) return;
      if (d.mode === "create") {
        const b = clamp(snap(loc.min), 0, 1440);
        if (b !== d.b) setDrag({ ...d, b });
      } else if (d.mode === "move") {
        const moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4;
        if (!moved) return;
        const dur = (d.item.end - d.item.start) / 60000;
        const startMin = clamp(snap(loc.min - d.grabMin), 0, 1440 - Math.min(dur, 15));
        if (moved !== d.moved || startMin !== d.startMin || loc.day !== d.day) setDrag({ ...d, moved, startMin, day: loc.day });
      } else {
        const startMin = minutesOfDay(d.item.start, tz);
        const endMin = clamp(snap(loc.min), startMin + SNAP_MIN, 1440);
        if (endMin !== d.endMin) setDrag({ ...d, endMin });
      }
      // Auto-scroll near the edges.
      const sc = scrollRef.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (e.clientY < r.top + 40) sc.scrollTop -= 12;
        else if (e.clientY > r.bottom - 30) sc.scrollTop += 12;
      }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      setDrag(null);
      if (d.mode === "create") {
        let a = Math.min(d.a, d.b);
        let b = Math.max(d.a, d.b);
        if (b - a < SNAP_MIN) b = Math.min(1440, a + 60);
        if (b <= a) a = b - 60;
        openEventDialog({ start: keyMinutesToMs(d.day, a, tz), end: keyMinutesToMs(d.day, b, tz) });
      } else if (d.mode === "move") {
        if (!d.moved) return; // a plain click; onClick opens the editor
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 50);
        const dur = d.item.end - d.item.start;
        const ns = keyMinutesToMs(d.day, d.startMin, tz);
        void moveEvent(d.item.event, ns, ns + dur);
      } else {
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 50);
        void moveEvent(d.item.event, d.item.start, keyMinutesToMs(d.day, d.endMin, tz), "resized");
      }
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }, [drag !== null, daysSig, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  function onColumnPointerDown(day: string, e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const a = clamp(Math.floor((e.clientY - r.top) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN, 0, 1440 - SNAP_MIN);
    setDrag({ mode: "create", day, a, b: a, pointerId: e.pointerId });
  }

  /** Touch: a tap on an empty slot creates a one-hour event there. */
  function onColumnClick(day: string, e: React.MouseEvent<HTMLDivElement>) {
    const pe = e.nativeEvent as PointerEvent;
    if (pe.pointerType !== "touch") return;
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const a = clamp(Math.floor((e.clientY - r.top) / PX_PER_MIN / 30) * 30, 0, 1380);
    openEventDialog({ start: keyMinutesToMs(day, a, tz), end: keyMinutesToMs(day, a + 60, tz) });
  }

  function onBlockPointerDown(seg: Seg, day: string, e: React.PointerEvent) {
    const it = seg.item;
    if (it.type !== "event" || e.button !== 0 || e.pointerType === "touch") return;
    if (!seg.isStart || !seg.isEnd) return; // multi-day segments: click only
    e.stopPropagation();
    const col = colRefs.current.get(day);
    if (!col) return;
    const r = col.getBoundingClientRect();
    const pointerMin = (e.clientY - r.top) / PX_PER_MIN;
    setDrag({ mode: "move", item: it, grabMin: pointerMin - seg.s, day, startMin: seg.s, moved: false, x: e.clientX, y: e.clientY, pointerId: e.pointerId });
  }

  function onResizePointerDown(seg: Seg, day: string, e: React.PointerEvent) {
    const it = seg.item;
    if (it.type !== "event" || e.button !== 0 || e.pointerType === "touch") return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({ mode: "resize", item: it, day, endMin: seg.e, pointerId: e.pointerId });
  }

  const ws = toMin(workStart);
  const we = toMin(workEnd);
  const nowMin = minutesOfDay(now, tz);
  const minColW = multi ? 96 : 0;
  const gridCols = `${GUTTER}px repeat(${days.length}, minmax(${minColW}px, 1fr))`;

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
      <div ref={scrollRef} className="relative h-[calc(100dvh-300px)] min-h-[440px] overflow-auto scroll-thin md:h-[calc(100dvh-210px)]" style={{ overscrollBehaviorX: "contain" }}>
        <div style={{ minWidth: multi ? GUTTER + days.length * minColW : undefined }}>
          {/* Header + all-day lane (sticky) */}
          <div className="sticky top-0 z-30 border-b border-line bg-surface">
            <div className="grid" style={{ gridTemplateColumns: gridCols }}>
              <div className="sticky left-0 z-10 bg-surface" />
              {days.map((k) => {
                const today = k === todayKey;
                const wd = weekdayOfKey(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => multi && onOpenDay(k)}
                    className={cn("flex items-baseline justify-center gap-1.5 border-l border-line py-2 text-[12px] text-fg-2", multi && "hover:bg-surface-2", !multi && "cursor-default justify-start pl-3")}
                    aria-label={formatKey(k, { weekday: "long", month: "long", day: "numeric" })}
                  >
                    <span className={cn("font-medium uppercase tracking-wide", (wd === 0 || wd === 6) && "text-fg-3")}>{formatKey(k, { weekday: "short" })}</span>
                    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[14px] font-semibold tabular-nums", today ? "bg-danger text-white" : "text-fg")}>
                      {Number(k.slice(8))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid border-t border-line" style={{ gridTemplateColumns: gridCols }}>
              <div className="sticky left-0 z-10 flex items-start justify-end bg-surface pt-1.5 pr-2 text-[10.5px] text-fg-3">
                {laneMax > LANE_LIMIT ? (
                  <button type="button" onClick={() => setLaneOpen((v) => !v)} className="inline-flex items-center gap-0.5 rounded px-1 hover:bg-surface-2 hover:text-fg" aria-label={laneOpen ? "Collapse all-day" : "Expand all-day"}>
                    all-day {laneOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                ) : (
                  "all-day"
                )}
              </div>
              {days.map((k) => {
                const list = lane.get(k) ?? [];
                const visible = laneOpen ? list : list.slice(0, list.length > LANE_LIMIT ? LANE_LIMIT - 1 : LANE_LIMIT);
                const hidden = list.length - visible.length;
                return (
                  <div
                    key={k}
                    data-daykey={k}
                    onDoubleClick={() => openEventDialog({ start: keyMinutesToMs(k, 0, tz), end: keyMinutesToMs(addDaysKey(k, 1), 0, tz), allDay: true })}
                    className={cn("flex min-h-[30px] min-w-0 flex-col gap-0.5 border-l border-line p-1", laneDrag.overDay === k && "bg-primary-soft")}
                    title="Double-click to add an all-day event"
                  >
                    {visible.map((it) => (
                      <ItemChip
                        key={it.key}
                        item={it}
                        tz={tz}
                        onOpen={laneDrag.guard(onOpen)}
                        onPointerDown={it.type === "event" ? laneDrag.onPointerDown(it) : undefined}
                        dragging={laneDrag.draggingKey === it.key}
                      />
                    ))}
                    {hidden > 0 && (
                      <button type="button" onClick={() => setLaneOpen(true)} className="h-5 rounded px-1.5 text-left text-[11px] font-medium text-fg-2 hover:bg-surface-2">
                        +{hidden} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time grid */}
          <div className="grid" style={{ gridTemplateColumns: gridCols }}>
            <div className="sticky left-0 z-20 bg-surface" style={{ height: 24 * HOUR_PX }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="relative" style={{ height: HOUR_PX }}>
                  {h > 0 && <span className="absolute -top-[7px] right-2 text-[10.5px] tabular-nums text-fg-3">{formatHour(h)}</span>}
                </div>
              ))}
            </div>
            {days.map((k) => {
              const daySegs = segs.get(k) ?? [];
              const layout = layoutOverlaps(daySegs);
              const wd = weekdayOfKey(k);
              const weekend = wd === 0 || wd === 6;
              const isToday = k === todayKey;
              return (
                <div
                  key={k}
                  ref={(el) => {
                    if (el) colRefs.current.set(k, el);
                    else colRefs.current.delete(k);
                  }}
                  data-daykey={k}
                  onPointerDown={(e) => onColumnPointerDown(k, e)}
                  onClick={(e) => onColumnClick(k, e)}
                  className={cn("relative border-l border-line select-none", weekend ? "bg-surface-2/60" : "bg-surface-2/40")}
                  style={{
                    height: 24 * HOUR_PX,
                    backgroundImage: `linear-gradient(to bottom, var(--border) 1px, transparent 1px)`,
                    backgroundSize: `100% ${HOUR_PX}px`,
                  }}
                >
                  {/* Working hours */}
                  {!weekend && we > ws && <div className="pointer-events-none absolute inset-x-0 bg-surface" style={{ top: ws * PX_PER_MIN + 1, height: (we - ws) * PX_PER_MIN - 1, backgroundImage: `linear-gradient(to bottom, var(--border) 1px, transparent 1px)`, backgroundSize: `100% ${HOUR_PX}px`, backgroundPosition: `0 ${-((ws * PX_PER_MIN + 1) % HOUR_PX)}px` }} />}

                  {daySegs.map((seg) => {
                    const pos = layout.get(seg.key) ?? { col: 0, cols: 1 };
                    const it = seg.item;
                    const isMoving = drag?.mode === "move" && drag.moved && drag.item.key === it.key;
                    const isResizing = drag?.mode === "resize" && drag.item.key === it.key;
                    const e = isResizing ? drag.endMin : seg.e;
                    return (
                      <Block
                        key={seg.key}
                        seg={seg}
                        top={seg.s * PX_PER_MIN}
                        height={Math.max(18, (e - seg.s) * PX_PER_MIN - 2)}
                        left={`calc(${(pos.col / pos.cols) * 100}% + 2px)`}
                        width={`calc(${100 / pos.cols}% - 4px)`}
                        tz={tz}
                        faded={isMoving}
                        endOverride={isResizing ? keyMinutesToMs(k, drag.endMin, tz) : undefined}
                        onPointerDown={(ev) => onBlockPointerDown(seg, k, ev)}
                        onResizePointerDown={(ev) => onResizePointerDown(seg, k, ev)}
                        onClick={() => {
                          if (suppressClick.current) return;
                          onOpen(it);
                        }}
                      />
                    );
                  })}

                  {/* Ghost while moving */}
                  {drag?.mode === "move" && drag.moved && drag.day === k && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-md px-2 py-1 text-[12px] font-medium"
                      style={{
                        top: drag.startMin * PX_PER_MIN,
                        height: Math.max(18, ((drag.item.end - drag.item.start) / 60000) * PX_PER_MIN - 2),
                        background: tint(drag.item.color, 26),
                        boxShadow: `inset 3px 0 0 ${drag.item.color}, var(--shadow-md)`,
                        outline: `1.5px solid ${drag.item.color}`,
                      }}
                    >
                      <div className="truncate">{drag.item.title}</div>
                      <div className="text-[11px] text-fg-2 tabular-nums">
                        {formatTimeRange(keyMinutesToMs(k, drag.startMin, tz), keyMinutesToMs(k, drag.startMin, tz) + (drag.item.end - drag.item.start), tz)}
                      </div>
                    </div>
                  )}

                  {/* Selection while creating */}
                  {drag?.mode === "create" && drag.day === k && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-md border border-primary/40 bg-primary-soft px-2 py-1 text-[11.5px] font-medium text-primary"
                      style={{ top: Math.min(drag.a, drag.b) * PX_PER_MIN, height: Math.max(SNAP_MIN, Math.abs(drag.b - drag.a)) * PX_PER_MIN }}
                    >
                      {formatTimeRange(keyMinutesToMs(k, Math.min(drag.a, drag.b), tz), keyMinutesToMs(k, Math.max(drag.a, drag.b, Math.min(drag.a, drag.b) + SNAP_MIN), tz), tz)}
                    </div>
                  )}

                  {/* Current time */}
                  {isToday && (
                    <div className="pointer-events-none absolute inset-x-0 z-[25]" style={{ top: nowMin * PX_PER_MIN }}>
                      <div className="relative h-[2px] bg-danger">
                        <span className="absolute -top-[4px] -left-[5px] h-[10px] w-[10px] rounded-full bg-danger" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatHour(h: number) {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${suffix}`;
}

function Block({
  seg,
  top,
  height,
  left,
  width,
  tz,
  faded,
  endOverride,
  onPointerDown,
  onResizePointerDown,
  onClick,
}: {
  seg: Seg;
  top: number;
  height: number;
  left: string;
  width: string;
  tz: string;
  faded?: boolean;
  endOverride?: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onResizePointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
}) {
  const it = seg.item;
  const compact = height < 34;
  const end = endOverride ?? it.end;
  const time = formatTimeRange(it.start, end, tz);

  if (it.type === "task") {
    const done = isDone(it);
    return (
      <div
        data-block
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        className="absolute z-10 cursor-pointer overflow-hidden rounded-md border-[1.5px] border-dashed bg-surface/90 px-1.5 py-0.5 text-[12px] transition-shadow hover:shadow-pop"
        style={{ top, height, left, width, borderColor: `color-mix(in srgb, ${it.color} 60%, var(--border))` }}
        title={`Task · ${it.title} · ${time}`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Checkbox checked={done} onChange={() => void toggleTask(it.task)} size={13} color={it.color} label={done ? "Mark as not done" : "Mark as done"} />
          <span className={cn("truncate font-medium", done && "text-fg-3 line-through")}>{it.title}</span>
        </div>
        {!compact && <div className="truncate pl-[19px] text-[11px] text-fg-3 tabular-nums">{time}</div>}
      </div>
    );
  }

  if (it.type !== "event") return null;
  const e = it.event;
  const canDrag = seg.isStart && seg.isEnd;
  return (
    <div
      data-block
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={(ev) => ev.key === "Enter" && onClick()}
      className={cn(
        "group absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-[12px] transition-[opacity,box-shadow] hover:z-[15] hover:shadow-pop",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        faded && "opacity-40",
      )}
      style={{ top, height, left, width, background: tint(it.color, 18), boxShadow: `inset 3px 0 0 ${it.color}` }}
      title={`${e.title} · ${time}`}
    >
      <div className={cn("flex min-w-0 items-center gap-1 pl-0.5", compact && "gap-1.5")}>
        <KindIcon item={it} className="h-3 w-3 shrink-0" />
        <span className="truncate font-semibold">{e.title}</span>
        {compact && <span className="shrink-0 text-[11px] text-fg-2 tabular-nums">{formatTime(it.start, tz)}</span>}
        {e.recurrence !== "NONE" && <Repeat className="h-2.5 w-2.5 shrink-0 text-fg-3" />}
      </div>
      {!compact && <div className="truncate pl-0.5 text-[11px] text-fg-2 tabular-nums">{time}</div>}
      {!compact && height > 58 && e.location && (
        <div className="flex items-center gap-1 truncate pl-0.5 text-[11px] text-fg-3">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{e.location}</span>
        </div>
      )}
      {canDrag && (
        <div
          onPointerDown={onResizePointerDown}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
          aria-hidden
        >
          <div className="mx-auto mt-[3px] h-[3px] w-6 rounded-full" style={{ background: it.color }} />
        </div>
      )}
    </div>
  );
}
