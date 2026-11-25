"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { FlaskConical, LayoutGrid, Plus, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/misc";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { toggleAIPanel } from "@/lib/ui-store";
import { useApi } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import type { KeyedMutator } from "swr";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import { container, item } from "./motion";
import { SummaryCards, SummaryCardsSkeleton } from "./summary-cards";
import { TodayFocus, TodayFocusSkeleton } from "./today-focus";
import { Upcoming, UpcomingSkeleton } from "./upcoming";
import { ProductivityOverview } from "./productivity-charts";
import { CustomizeDialog } from "./customize-dialog";
import { SpacesWidget } from "./spaces-widget";
import { GratitudeWidget, MoodCheckinWidget, QuickActionsWidget, QuickJournalWidget, RecentMemoriesWidget, WeekSummaryWidget } from "./personal-widgets";
import { widgetMeta, type WidgetId } from "./widgets";

// Mobile: 2-col mini tiles. Tablet: 2 columns. Desktop: 3 columns.
const CARD_GRID = "grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 lg:gap-5";

function DemoBanner() {
  const { data } = useMe();
  if (!data?.hasDemoData) return null;
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-[12px] border border-dashed border-line-strong px-3.5 py-2 text-[12.5px] text-fg-2">
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-fg-3" />
      <span className="flex-1">Showing sample data so you can explore.</span>
      <Link href="/settings#data" className="shrink-0 font-medium text-primary hover:underline">
        Remove
      </Link>
    </div>
  );
}

function Header({ data, onCustomize }: { data?: DashboardData; onCustomize?: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {data ? (
          <>
            <p className="text-[12.5px] font-medium text-fg-3">{data.today.label}</p>
            <h1 className="font-display mt-0.5 truncate text-[26px] font-semibold md:text-[30px]">
              {data.today.greeting}
              {data.today.firstName ? `, ${data.today.firstName}` : ""}
            </h1>
            {data.subtitle && <p className="mt-1 text-[13.5px] text-fg-2">{data.subtitle}</p>}
          </>
        ) : (
          <>
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="mt-2 h-7 w-64" />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onCustomize && (
          <Button variant="ghost" size="sm" onClick={onCustomize}>
            <LayoutGrid className="h-3.5 w-3.5" /> Customise
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => toggleAIPanel(true)}>
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Ask AI
        </Button>
        <Button size="sm" onClick={() => openTaskDialog(data ? { dueDate: data.today.key } : undefined)}>
          <Plus className="h-3.5 w-3.5" /> Add task
        </Button>
      </div>
    </div>
  );
}

export function Overview() {
  const { data, error, isLoading, mutate } = useApi<DashboardData>("/api/dashboard", { refreshInterval: 5 * 60_000 });
  const [customizing, setCustomizing] = useState(false);

  if (error && !data) {
    return (
      <>
        <Header />
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <h2 className="text-[15px] font-semibold">Couldn&apos;t load your dashboard</h2>
          <p className="max-w-sm text-[13px] text-fg-2">{error instanceof Error ? error.message : "Something went wrong."}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </Button>
        </Card>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <div aria-busy="true" aria-label="Loading dashboard">
        <Header />
        <div className={CARD_GRID}>
          <SummaryCardsSkeleton />
        </div>
        <div className="mt-5 grid gap-5 lg:mt-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <TodayFocusSkeleton />
          <UpcomingSkeleton />
        </div>
        <div className="mt-8">
          <Skeleton className="mb-1.5 h-4 w-44" />
          <Skeleton className="mb-4 h-3 w-60" />
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[290px] rounded-[14px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <Header data={data} onCustomize={() => setCustomizing(true)} />
        <DemoBanner />
      </motion.div>

      {error && (
        <motion.div variants={item} className="mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-danger-soft px-3.5 py-2 text-[12.5px] text-danger">
          <span>Couldn&apos;t refresh. Showing the last loaded data.</span>
          <button className="font-medium underline-offset-2 hover:underline" onClick={() => void mutate()}>
            Retry
          </button>
        </motion.div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {data.layout
          .filter((w) => w.visible)
          .map((w) => (
            <WidgetSlot key={w.id} id={w.id}>
              {renderWidget(w.id, data, mutate)}
            </WidgetSlot>
          ))}
      </div>
      {data.layout.every((w) => !w.visible) && (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-[13.5px] text-fg-2">All widgets are hidden. Bring back the ones you like.</p>
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
            <LayoutGrid className="h-3.5 w-3.5" /> Customise
          </Button>
        </Card>
      )}
      <CustomizeDialog open={customizing} onOpenChange={setCustomizing} data={data} mutate={mutate} />
    </motion.div>
  );
}

function WidgetSlot({ id, children }: { id: WidgetId; children: ReactNode }) {
  const full = widgetMeta(id)?.size === "full";
  return (
    <motion.div
      variants={item}
      className={cn("min-w-0", full && "xl:col-span-2", id === "upcoming" && "relative xl:min-h-[520px]", id === "productivity" && "mt-3")}
      aria-label={id === "summary" ? "Summary" : undefined}
    >
      {children}
    </motion.div>
  );
}

function renderWidget(id: WidgetId, data: DashboardData, mutate: KeyedMutator<DashboardData>) {
  const props = { data, mutate };
  switch (id) {
    case "summary":
      return (
        <motion.div variants={container} className={CARD_GRID}>
          <SummaryCards data={data} />
        </motion.div>
      );
    case "spaces":
      return <SpacesWidget data={data} />;
    case "capture":
      return <QuickActionsWidget {...props} />;
    case "focus":
      return <TodayFocus data={data} mutate={mutate} />;
    case "upcoming":
      return <Upcoming data={data} className="xl:absolute xl:inset-0" />;
    case "mood":
      return <MoodCheckinWidget {...props} />;
    case "journal":
      return <QuickJournalWidget {...props} />;
    case "gratitude":
      return <GratitudeWidget {...props} />;
    case "week":
      return <WeekSummaryWidget {...props} />;
    case "memories":
      return <RecentMemoriesWidget {...props} />;
    case "productivity":
      return <ProductivityOverview />;
  }
}
