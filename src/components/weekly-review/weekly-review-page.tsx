"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, NotebookPen, RotateCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { ReflectionCard } from "./reflection";
import { WeekStatsView } from "./week-stats";
import type { WeeklyReviewHistoryItem, WeeklyReviewResponse } from "./types";

function PastWeeks({ current, onPick }: { current: string; onPick: (w: string) => void }) {
  const { data, isLoading } = useApi<{ items: WeeklyReviewHistoryItem[] }>("/api/weekly-review/history");
  return (
    <Card className="p-4 md:p-5">
      <h2 className="text-[15px] font-semibold">Past reflections</h2>
      {isLoading && !data ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : data?.items.length ? (
        <ul className="mt-2 flex flex-col">
          {data.items.map((r) => (
            <li key={r.weekStart}>
              <button
                type="button"
                onClick={() => onPick(r.weekStart)}
                aria-current={r.weekStart === current ? "true" : undefined}
                className={cn("flex w-full flex-col gap-0.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-surface-2", r.weekStart === current && "bg-primary-soft")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-fg">{r.label}</span>
                  {r.rating != null && (
                    <span className="flex items-center gap-0.5 text-[12px] text-fg-2" aria-label={`Rated ${r.rating} of 5`}>
                      <Star className="h-3.5 w-3.5 fill-[var(--warning-fill)] text-warning" aria-hidden /> {r.rating}
                    </span>
                  )}
                </span>
                {r.preview && <span className="line-clamp-1 text-[12.5px] text-fg-2">{r.preview}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-fg-3">Your saved reflections will gather here, week by week.</p>
      )}
    </Card>
  );
}

export function WeeklyReviewPage() {
  const [week, setWeek] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useApi<WeeklyReviewResponse>(`/api/weekly-review${week ? `?week=${week}` : ""}`);
  const info = data?.week;

  return (
    <div>
      <PageHeader title="Weekly Review" description="Look back gently, then choose what matters next." />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous week" disabled={!info} onClick={() => info && setWeek(info.prev)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[170px] px-2 text-center">
            {info ? (
              <>
                <div className="font-display text-[17px] font-semibold">{info.label}</div>
                <div className="text-[12px] text-fg-3">{info.isCurrent ? "This week" : "Past week"}</div>
              </>
            ) : (
              <Skeleton className="mx-auto h-5 w-36" />
            )}
          </div>
          <Button variant="outline" size="icon" aria-label="Next week" disabled={!info?.next} onClick={() => info?.next && setWeek(info.next)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {info && !info.isCurrent && (
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setWeek(null)}>
              This week
            </Button>
          )}
        </div>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg-2">From your data</span>
      </div>

      {error && !data ? (
        <Card>
          <EmptyState
            icon={NotebookPen}
            title="Couldn't load this week"
            description={error instanceof Error ? error.message : "Something went wrong."}
            action={
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                <RotateCw className="h-3.5 w-3.5" /> Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0" aria-busy={isLoading}>
            {data ? (
              <WeekStatsView week={data.week} stats={data.stats} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-[84px] rounded-[12px]" />
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[180px] rounded-[14px]" />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {data ? <ReflectionCard key={data.week.start} weekStart={data.week.start} initial={data.reflection} /> : <Skeleton className="h-[520px] rounded-[14px]" />}
            <PastWeeks current={info?.start ?? ""} onPick={setWeek} />
          </div>
        </div>
      )}
    </div>
  );
}
