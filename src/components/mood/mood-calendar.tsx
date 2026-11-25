"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Card, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import { moodMeta } from "@/lib/moods";
import { latestPerDay } from "@/lib/mood";
import { addDaysKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CheckinForm, moodTint } from "./checkin-form";
import { dayHeading, EntryRow, useEditCheckin } from "./entry-list";
import type { MoodListResponse } from "./types";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const last = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  return { first, last, days: Number(last.slice(8)) };
}

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + n, 1)).toISOString().slice(0, 7);
}

export function MoodCalendar({ todayKey }: { todayKey: string }) {
  const [ym, setYm] = useState(todayKey.slice(0, 7));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { data: me } = useMe();
  const weekStart = me?.settings.weekStart === 0 ? 0 : 1;
  const { first, last, days } = monthBounds(ym);
  const { data, isLoading, error } = useApi<MoodListResponse>(`/api/mood?from=${first}&to=${last}&limit=500`);
  const { setEditing, dialog } = useEditCheckin();

  const latest = useMemo(() => latestPerDay(data?.items ?? []), [data]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data?.items ?? []) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    return m;
  }, [data]);

  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDaysKey(first, i))];
  while (cells.length % 7) cells.push(null);
  const heads = Array.from({ length: 7 }, (_, i) => WD[(i + weekStart) % 7]!);
  const monthLabel = new Date(`${first}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const logged = latest.size;
  const dayEntries = openDay ? (data?.items ?? []).filter((e) => e.date === openDay) : [];

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-semibold">{monthLabel}</h2>
          <p className="text-[12px] text-fg-3">{isLoading ? "Loading…" : logged ? `${logged} ${logged === 1 ? "day" : "days"} logged` : "No check-ins this month yet"}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setYm(shiftMonth(ym, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {ym !== todayKey.slice(0, 7) && (
            <Button variant="outline" size="sm" onClick={() => setYm(todayKey.slice(0, 7))}>
              Today
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Next month" disabled={ym >= todayKey.slice(0, 7)} onClick={() => setYm(shiftMonth(ym, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {error && <p className="mb-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">Couldn&apos;t load this month. {error instanceof Error ? error.message : ""}</p>}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Mood calendar, ${monthLabel}`}>
        {heads.map((h) => (
          <div key={h} className="pb-1 text-center text-[11px] font-medium text-fg-3">
            {h}
          </div>
        ))}
        {cells.map((k, i) => {
          if (!k) return <div key={`x${i}`} />;
          if (isLoading && !data) return <Skeleton key={k} className="aspect-square rounded-[10px]" />;
          const e = latest.get(k);
          const m = moodMeta(e?.mood);
          const future = k > todayKey;
          const n = counts.get(k) ?? 0;
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              onClick={() => setOpenDay(k)}
              aria-label={`${dayHeading(k)}: ${m ? `${m.label}${n > 1 ? `, ${n} check-ins` : ""}` : "no check-in"}`}
              style={e ? { background: moodTint(e.mood, 30), borderColor: m?.color } : undefined}
              className={cn(
                "relative flex aspect-square min-h-[40px] flex-col items-center justify-center rounded-[10px] border text-[12px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-primary/30",
                e ? "border-transparent" : "border-line bg-surface hover:bg-surface-2",
                future && "cursor-default opacity-50",
                k === todayKey && "ring-2 ring-primary",
              )}
            >
              <span className={cn("absolute top-1 left-1.5 text-[11px] font-medium tabular-nums", e ? "text-fg" : "text-fg-3")}>{Number(k.slice(8))}</span>
              {m && (
                <span className="mt-2 text-[18px] leading-none sm:text-[22px]" aria-hidden>
                  {m.emoji}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog
        open={!!openDay}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDay(null);
            setAdding(false);
          }
        }}
        title={openDay ? dayHeading(openDay, todayKey) : ""}
        description={dayEntries.length ? `${dayEntries.length} ${dayEntries.length === 1 ? "check-in" : "check-ins"} — the latest is the day's mood` : "No check-in for this day"}
        size="lg"
      >
        {adding && openDay ? (
          <CheckinForm date={openDay} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} submitLabel="Save for this day" />
        ) : (
          <>
            {dayEntries.length > 0 && (
              <ul className="-mt-2 divide-y divide-line">
                {dayEntries.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={setEditing} />
                ))}
              </ul>
            )}
            <Button variant="outline" className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add a check-in for this day
            </Button>
          </>
        )}
      </Dialog>
      {dialog}
    </Card>
  );
}
