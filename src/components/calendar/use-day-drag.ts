"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { moveEvent } from "./actions";
import type { CalItem } from "./types";
import { diffDays, shiftDaysMs } from "./utils";

type State = { key: string; originDay: string; overDay: string | null; moved: boolean; x: number; y: number };

/**
 * Drag event chips between day cells (elements carrying data-daykey). Keeps the time of day.
 * Mouse/pen only; touch keeps native scrolling and swipe navigation.
 */
export function useDayDrag(tz: string) {
  const [drag, setDrag] = useState<State | null>(null);
  const itemRef = useRef<CalItem | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = useCallback(
    (item: CalItem) => (e: React.PointerEvent) => {
      if (item.type !== "event" || e.button !== 0 || e.pointerType === "touch") return;
      const cell = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-daykey]");
      if (!cell?.dataset.daykey) return;
      e.stopPropagation();
      itemRef.current = item;
      setDrag({ key: item.key, originDay: cell.dataset.daykey, overDay: cell.dataset.daykey, moved: false, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const dragRef = useRef<State | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5;
      if (!moved) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-daykey]");
      const overDay = el?.dataset.daykey ?? d.overDay;
      if (moved !== d.moved || overDay !== d.overDay) setDrag({ ...d, moved, overDay });
    };
    const up = () => {
      const d = dragRef.current;
      const item = itemRef.current;
      setDrag(null);
      if (!d?.moved) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 50);
      if (item?.type === "event" && d.overDay) {
        const delta = diffDays(d.originDay, d.overDay);
        if (delta !== 0) void moveEvent(item.event, shiftDaysMs(item.start, delta, tz), shiftDaysMs(item.end, delta, tz));
      }
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }, [drag !== null, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    onPointerDown,
    draggingKey: drag?.moved ? drag.key : null,
    overDay: drag?.moved ? drag.overDay : null,
    /** Wrap click handlers: ignores the click that ends a drag. */
    guard: <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
      if (suppressClick.current) return;
      fn(...a);
    },
  };
}
