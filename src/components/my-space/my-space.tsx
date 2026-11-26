"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { ChevronDown, FlaskConical, ImagePlus, LayoutGrid, ListPlus, NotebookPen, RotateCw, Smile, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Kbd, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { TransactionDialogHost, openTxDialog } from "@/components/finance/transaction-dialog";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { isLive } from "@/components/layout/nav";
import { api } from "@/lib/client";
import { openQuickCapture } from "@/lib/ui-store";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import { defaultLayout, mySpaceMeta, type MySpaceLayout, type MySpacePref, type MySpaceWidgetId } from "./registry";
import type { MySpaceData, MySpaceSections, SectionId } from "./types";
import { CustomizeMySpace } from "./customize-dialog";
import { TodaySection } from "./today";
import { ThisWeek } from "./this-week";
import * as W from "./widgets";

/**
 * SWR key for GET /api/my-space. It starts with "/api/dashboard" on purpose: every module calls
 * refresh(...SUMMARY_KEYS) after a change, and SUMMARY_KEYS includes "/api/dashboard", so My space
 * stays in sync with edits made anywhere (task dialog, event dialog, finance form…) without new wiring.
 */
export const MY_SPACE_KEY = "/api/dashboard#my-space";
const fetchMySpace = () => api.get<MySpaceData>("/api/my-space");

const COMPONENTS: { [K in MySpaceWidgetId]: (p: W.Common & { data: MySpaceSections[K] | undefined; loading: boolean }) => React.ReactElement } = {
  tasks: W.TasksWidget,
  goals: W.GoalsWidget,
  calendar: W.CalendarWidget,
  reminders: W.RemindersWidget,
  habits: W.HabitsWidget,
  notes: W.NotesWidget,
  journal: W.JournalWidget,
  gratitude: W.GratitudeWidget,
  memories: W.MemoriesWidget,
  bucket: W.BucketWidget,
  timeline: W.TimelineWidget,
  vault: W.VaultWidget,
  storage: W.StorageWidget,
  security: W.SecurityWidget,
  finance: W.FinanceWidget,
};

/** Only widgets whose page is live (same `ready` flag the menu uses). */
const available = (widgets: MySpacePref[]) => widgets.filter((w) => isLive(mySpaceMeta(w.id)!.href));

const COLLAPSE_KEY = "pad-myspace-collapsed"; // widgets (phones)
const SECTION_COLLAPSE_KEY = "pad-myspace-sections"; // page sections (all sizes)

function useStoredList(key: string) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(v)) setList(v.filter((x): x is string => typeof x === "string"));
    } catch {}
  }, [key]);
  const toggle = (id: string) =>
    setList((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [list, toggle] as const;
}

export function MySpace() {
  const { data, error, isLoading, mutate } = useSWR<MySpaceData>(MY_SPACE_KEY, fetchMySpace, { revalidateOnFocus: true, keepPreviousData: true, refreshInterval: 5 * 60_000 });
  const [customizing, setCustomizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<Set<SectionId>>(new Set());
  const [collapsed, toggleCollapse] = useStoredList(COLLAPSE_KEY);
  const [closedSections, toggleSection] = useStoredList(SECTION_COLLAPSE_KEY);

  const patch = useCallback<W.Common["patch"]>(
    (id, fn) => {
      void mutate(
        (cur) => {
          const s = cur?.sections[id];
          return cur && s ? { ...cur, sections: { ...cur.sections, [id]: fn(s as never) } } : cur;
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const reload = useCallback(
    async (id: SectionId) => {
      setRetrying((s) => new Set(s).add(id));
      try {
        const res = await api.get<MySpaceData>(`/api/my-space?only=${id}`);
        await mutate((cur) => (cur ? { ...cur, sections: { ...cur.sections, [id]: res.sections[id] ?? null } } : cur), { revalidate: false });
        if (res.sections[id] == null) toast.error("Still couldn't load that. Try again in a moment.");
      } catch (err) {
        toastError(err);
      } finally {
        setRetrying((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [mutate],
  );

  async function persist(body: MySpaceLayout | null, message: string) {
    if (!data) return;
    setSaving(true);
    const prev = data;
    await mutate({ ...data, layout: body ?? defaultLayout() }, { revalidate: false });
    try {
      const res = await api.put<{ layout: MySpaceLayout }>("/api/my-space/layout", body ? { sections: body.sections, widgets: body.widgets } : { reset: true });
      await mutate((cur) => (cur ? { ...cur, layout: res.layout } : cur), { revalidate: false });
      toast.success(message);
      setCustomizing(false);
    } catch (err) {
      await mutate(prev, { revalidate: false });
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) {
    return (
      <>
        <Header />
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center" role="alert">
          <h2 className="text-[15px] font-semibold">Couldn&apos;t load My space</h2>
          <p className="max-w-sm text-[13px] text-fg-2">{error instanceof Error ? error.message : "Something went wrong."}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </Button>
        </Card>
      </>
    );
  }

  const layout = data?.layout ?? defaultLayout();
  const widgets = available(layout.widgets).filter((w) => w.visible);
  const loading = isLoading && !data;
  const slot = <K extends SectionId>(id: K) => ({
    data: retrying.has(id) ? undefined : data ? (data.sections[id] ?? null) : undefined,
    loading: loading || retrying.has(id),
    onRetry: () => void reload(id),
  });
  const todayOpen = layout.sections.today && !closedSections.includes("today");
  const nothingShown = !layout.sections.today && !layout.sections.week && widgets.length === 0;

  return (
    <div aria-busy={loading || undefined}>
      <Header data={data} onCustomize={() => setCustomizing(true)} moodHere={todayOpen} />
      <DemoBanner />

      {error && data && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-danger-soft px-3.5 py-2 text-[12.5px] text-danger" role="status">
          <span>Couldn&apos;t refresh. Showing the last loaded data.</span>
          <button className="min-h-9 font-medium underline-offset-2 hover:underline" onClick={() => void mutate()}>
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-9">
        {layout.sections.today && (
          <PageSection id="today" title="Today" description="Your focus, how you feel and what's coming up." open={todayOpen} onToggle={() => toggleSection("today")}>
            <TodaySection todayKey={data?.today.key ?? ""} focus={slot("focus")} mood={slot("mood")} upcoming={slot("upcoming")} patch={patch} />
          </PageSection>
        )}

        <PageSection
          id="spaces"
          title="Your spaces"
          description="Every part of your life, one tap away. Customise to reorder, resize or hide."
          open={!closedSections.includes("spaces")}
          onToggle={() => toggleSection("spaces")}
        >
          {widgets.length ? (
            <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 min-[1700px]:grid-cols-4">
              {widgets.map((w) => {
                const Comp = COMPONENTS[w.id] as (p: W.Common & { data: unknown; loading: boolean }) => React.ReactElement;
                const s = slot(w.id);
                return (
                  <Comp
                    key={w.id}
                    data={s.data}
                    loading={s.loading}
                    size={w.size}
                    collapsed={collapsed.includes(w.id)}
                    onToggleCollapse={() => toggleCollapse(w.id)}
                    onRetry={s.onRetry}
                    reload={s.onRetry}
                    todayKey={data?.today.key ?? ""}
                    patch={patch}
                  />
                );
              })}
            </div>
          ) : (
            data && (
              <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="text-[13.5px] text-fg-2">All your spaces are hidden. Bring back the ones you like.</p>
                <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Customise
                </Button>
              </Card>
            )
          )}
        </PageSection>

        {layout.sections.week && (
          <PageSection
            id="week"
            title="This week"
            description="How the week is going, with charts over any range."
            open={!closedSections.includes("week")}
            onToggle={() => toggleSection("week")}
          >
            <ThisWeek {...slot("week")} />
          </PageSection>
        )}
      </div>

      {data && nothingShown && <p className="mt-4 text-center text-[13px] text-fg-2">Everything is switched off. Use Customise to bring sections back.</p>}

      {data && (
        <CustomizeMySpace
          open={customizing}
          onOpenChange={setCustomizing}
          layout={{ sections: layout.sections, widgets: available(layout.widgets) }}
          saving={saving}
          onSave={(next) => void persist(next, "My space saved")}
          onReset={() => void persist(null, "My space reset to default")}
        />
      )}
      {isLive("/finance") && <TransactionDialogHost />}
    </div>
  );
}

/** A titled page section with a remembered collapse toggle. */
function PageSection({ id, title, description, open, onToggle, children }: { id: string; title: string; description: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const bodyId = `ms-section-${id}`;
  return (
    <section aria-labelledby={`${bodyId}-title`}>
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${bodyId}-title`} className="font-display text-[20px] leading-tight font-semibold text-fg">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] px-2.5 text-[12.5px] font-medium text-fg-2 outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-3 focus-visible:ring-primary/30"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} aria-hidden />
          {open ? "Hide" : "Show"}
          <span className="sr-only"> {title}</span>
        </button>
      </div>
      <div id={bodyId} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

const quickCls =
  "inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-[13.5px] font-medium text-fg transition-colors hover:bg-surface-2 outline-none focus-visible:ring-3 focus-visible:ring-primary/30";

function Header({ data, onCustomize, moodHere }: { data?: MySpaceData; onCustomize?: () => void; moodHere?: boolean }) {
  const router = useRouter();
  const t = data?.today;

  /** Jump to the mood check-in on this page when Today is open, else to the Mood tracker. */
  function mood() {
    const card = moodHere ? document.getElementById("today-mood") : null;
    if (!card) return router.push("/mood");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.querySelector<HTMLButtonElement>('[role="group"] button, button')?.focus({ preventScroll: true });
  }

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {t ? (
            <>
              <p className="text-[12.5px] font-medium text-fg-2">{t.label}</p>
              <h1 className="font-display mt-0.5 text-[26px] leading-tight font-semibold text-fg md:text-[30px]">
                {t.greeting}
                {t.firstName ? `, ${t.firstName}` : ""}
              </h1>
              {t.subtitle && <p className="mt-1 text-[13.5px] text-fg-2">{t.subtitle}</p>}
            </>
          ) : (
            <>
              <h1 className="sr-only">My space</h1>
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="mt-2 h-7 w-64" />
              <Skeleton className="mt-2 h-3.5 w-52" />
            </>
          )}
        </div>
        {onCustomize && (
          <Button variant="outline" size="sm" onClick={onCustomize} disabled={!data}>
            <LayoutGrid className="h-3.5 w-3.5" /> Customise
          </Button>
        )}
      </div>
      {onCustomize && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick actions">
          <button type="button" className={quickCls} onClick={() => openTaskDialog(t ? { dueDate: t.key } : undefined)}>
            <ListPlus className="h-4 w-4 text-primary" aria-hidden /> Task
          </button>
          <Link href="/journal?new=1" className={quickCls}>
            <NotebookPen className="h-4 w-4 text-primary" aria-hidden /> Write
          </Link>
          <button type="button" className={quickCls} onClick={mood}>
            <Smile className="h-4 w-4 text-primary" aria-hidden /> Mood
          </button>
          {isLive("/finance") && (
            <button type="button" className={quickCls} onClick={() => openTxDialog({ preset: { type: "expense" } })}>
              <Wallet className="h-4 w-4 text-primary" aria-hidden /> Expense
            </button>
          )}
          <Link href="/memories?new=1" className={quickCls}>
            <ImagePlus className="h-4 w-4 text-primary" aria-hidden /> Memory
          </Link>
          <button type="button" className={quickCls} onClick={() => openQuickCapture()} aria-keyshortcuts="Meta+K Control+K">
            <Zap className="h-4 w-4 text-primary" aria-hidden /> Capture
            <span className="hidden sm:inline-flex">
              <Kbd>⌘K</Kbd>
            </span>
          </button>
        </div>
      )}
    </header>
  );
}

function DemoBanner() {
  const { data } = useMe();
  if (!data?.hasDemoData) return null;
  return (
    <div className="mb-6 flex items-center gap-2.5 rounded-[12px] border border-dashed border-line-strong px-3.5 py-2 text-[12.5px] text-fg-2">
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-fg-2" aria-hidden />
      <span className="flex-1">Showing sample data so you can explore.</span>
      <Link href="/settings#data" className="shrink-0 font-medium text-primary hover:underline">
        Remove
      </Link>
    </div>
  );
}
