"use client";
import { useMemo, useState } from "react";
import { CalendarDays, History, LineChart, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Segmented, SkeletonList } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { useTz } from "@/lib/use-me";
import { dayKey } from "@/lib/time";
import { moodMeta } from "@/lib/moods";
import { CheckinForm } from "./checkin-form";
import { dayHeading, EntryRow, useEditCheckin } from "./entry-list";
import { MoodCalendar } from "./mood-calendar";
import { MoodTrends } from "./mood-trends";
import type { MoodListResponse } from "./types";

type Tab = "calendar" | "trends" | "history";
const PAGE = 30;

function TodayList({ todayKey }: { todayKey: string }) {
  const { data, isLoading } = useApi<MoodListResponse>(`/api/mood?from=${todayKey}&to=${todayKey}&limit=100`);
  const { setEditing, dialog } = useEditCheckin();
  const items = data?.items ?? [];
  const latest = moodMeta(items[0]?.mood);
  return (
    <Card className="p-4 md:p-5">
      <h2 className="text-[15px] font-semibold">Today</h2>
      <p className="mt-0.5 text-[12px] text-fg-3">
        {latest ? `Feeling ${latest.label.toLowerCase()} right now · ${items.length} ${items.length === 1 ? "check-in" : "check-ins"}` : "No check-ins yet today"}
      </p>
      {isLoading && !data ? (
        <div className="mt-3">
          <SkeletonList rows={2} />
        </div>
      ) : items.length ? (
        <ul className="mt-1 divide-y divide-line">
          {items.map((e) => (
            <EntryRow key={e.id} entry={e} onEdit={setEditing} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-[10px] bg-surface-2 px-3 py-3 text-[13px] leading-relaxed text-fg-2">
          However today feels is okay. Checking in — even once — helps you notice patterns over time.
        </p>
      )}
      {dialog}
    </Card>
  );
}

function HistoryList({ todayKey }: { todayKey: string }) {
  const [pages, setPages] = useState(1);
  const { data, isLoading, error } = useApi<MoodListResponse>(`/api/mood?limit=${PAGE * pages}`);
  const { setEditing, dialog } = useEditCheckin();
  const groups = useMemo(() => {
    const out: { key: string; items: MoodListResponse["items"] }[] = [];
    for (const e of data?.items ?? []) {
      const last = out[out.length - 1];
      if (last && last.key === e.date) last.items.push(e);
      else out.push({ key: e.date, items: [e] });
    }
    return out;
  }, [data]);

  if (isLoading && !data) return <SkeletonList rows={6} />;
  if (error && !data) return <Card className="px-5 py-8 text-center text-[13.5px] text-fg-2">Couldn&apos;t load your check-ins. {error instanceof Error ? error.message : ""}</Card>;
  if (!groups.length)
    return (
      <Card>
        <EmptyState icon={SmilePlus} title="Your mood story starts here" description="Each check-in you save shows up in this list, newest first." />
      </Card>
    );
  return (
    <Card className="px-4 py-2 md:px-5">
      {groups.map((g) => (
        <section key={g.key} className="border-b border-line py-2 last:border-0">
          <h3 className="pt-2 text-[12.5px] font-semibold text-fg-2">{dayHeading(g.key, todayKey)}</h3>
          <ul className="divide-y divide-line">
            {g.items.map((e) => (
              <EntryRow key={e.id} entry={e} onEdit={setEditing} />
            ))}
          </ul>
        </section>
      ))}
      {data?.nextCursor && (
        <div className="flex justify-center py-3">
          <Button variant="outline" size="sm" loading={isLoading} onClick={() => setPages((p) => p + 1)}>
            Show older check-ins
          </Button>
        </div>
      )}
      {dialog}
    </Card>
  );
}

export function MoodPage() {
  const tz = useTz();
  const todayKey = dayKey(new Date(), tz);
  const [tab, setTab] = useState<Tab>("calendar");
  return (
    <div>
      <PageHeader title="Mood Tracker" description="Notice how you feel — no right or wrong answers." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-4 md:p-5">
          <h2 className="font-display text-[20px] font-semibold">How are you feeling?</h2>
          <p className="mt-0.5 mb-4 text-[12.5px] text-fg-3">Pick the closest one. You can check in as often as you like.</p>
          <CheckinForm />
        </Card>
        <TodayList todayKey={todayKey} />
      </div>
      <div className="mt-8 mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "calendar", label: "Calendar", icon: CalendarDays },
            { value: "trends", label: "Trends", icon: LineChart },
            { value: "history", label: "All check-ins", icon: History },
          ]}
        />
      </div>
      {tab === "calendar" && <MoodCalendar todayKey={todayKey} />}
      {tab === "trends" && <MoodTrends />}
      {tab === "history" && <HistoryList todayKey={todayKey} />}
    </div>
  );
}
