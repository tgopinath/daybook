"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, BarChart3, ClipboardCheck } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/misc";
import { ChartCardSkeleton } from "@/components/dashboard/chart-kit";
import { moodMeta } from "@/lib/moods";
import { scoreWord } from "@/lib/mood";
import type { WeekSection } from "./types";
import { SectionError } from "./today";
import { secondaryActionCls } from "./widget-card";

/** Charts are below the fold: loaded only when This week is open. */
const ProductivityOverview = dynamic(() => import("@/components/dashboard/productivity-charts").then((m) => m.ProductivityOverview), {
  ssr: false,
  loading: () => (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5" aria-busy="true" aria-label="Loading charts">
      {[0, 1].map((i) => (
        <ChartCardSkeleton key={i} />
      ))}
    </div>
  ),
});

export function ThisWeek({ data, loading, onRetry }: { data: WeekSection | null | undefined; loading: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {loading && data === undefined ? (
        <WeekSkeleton />
      ) : data ? (
        <WeekSummary week={data} />
      ) : (
        <SectionError title="Your week so far" onRetry={onRetry} />
      )}
      <ProductivityOverview />
    </div>
  );
}

function WeekSummary({ week: w }: { week: WeekSection }) {
  const dom = moodMeta(w.moodDominant);
  const tiles = [
    { label: "Tasks done", value: String(w.tasksDone) },
    { label: "Habits kept", value: w.habitRate != null ? `${w.habitRate}%` : "—" },
    { label: "Mood", value: w.moodAvg != null ? `${dom ? `${dom.emoji} ` : ""}${scoreWord(w.moodAvg)}` : "—" },
    { label: "Journal days", value: `${w.journalDays} of ${w.elapsed}` },
  ];
  return (
    <Card className="p-4 md:p-5" role="region" aria-labelledby="week-summary-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="week-summary-title" className="font-display text-[17px] font-semibold text-fg">
            Your week so far
          </h3>
          <p className="mt-0.5 text-[12.5px] text-fg-2">{w.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/weekly-review" className={secondaryActionCls}>
            <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden /> Weekly review <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link href="/insights" className={secondaryActionCls}>
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden /> Insights <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
            <dt className="text-[12px] font-medium text-fg-2">{t.label}</dt>
            <dd className="font-display mt-0.5 text-[20px] leading-tight font-semibold text-fg tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function WeekSkeleton() {
  return (
    <Card className="p-4 md:p-5" aria-busy="true" aria-label="Loading your week">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-28" />
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[62px] rounded-[12px]" />
        ))}
      </div>
    </Card>
  );
}
