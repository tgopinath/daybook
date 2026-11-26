"use client";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { LayoutGrid, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { TransactionDialogHost } from "@/components/finance/transaction-dialog";
import { isLive } from "@/components/layout/nav";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DEFAULT_MY_SPACE, mySpaceMeta, type MySpacePref, type MySpaceWidgetId } from "./registry";
import type { MySpaceData, MySpaceSections } from "./types";
import { CustomizeMySpace } from "./customize-dialog";
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
  mood: W.MoodWidget,
  memories: W.MemoriesWidget,
  bucket: W.BucketWidget,
  timeline: W.TimelineWidget,
  vault: W.VaultWidget,
  storage: W.StorageWidget,
  security: W.SecurityWidget,
  finance: W.FinanceWidget,
};

/** Only widgets whose page is live (same `ready` flag the menu uses). */
const available = (layout: MySpacePref[]) => layout.filter((w) => isLive(mySpaceMeta(w.id)!.href));

const COLLAPSE_KEY = "pad-myspace-collapsed";

export function MySpace() {
  const { data, error, isLoading, mutate } = useSWR<MySpaceData>(MY_SPACE_KEY, fetchMySpace, { revalidateOnFocus: true, keepPreviousData: true, refreshInterval: 5 * 60_000 });
  const [customizing, setCustomizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<Set<MySpaceWidgetId>>(new Set());
  const [collapsed, setCollapsed] = useState<string[]>([]);

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]"));
    } catch {}
  }, []);
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

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
    async (id: MySpaceWidgetId) => {
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

  async function persist(body: { widgets: MySpacePref[] } | { reset: true }, message: string) {
    if (!data) return;
    setSaving(true);
    const prev = data;
    const layout = "reset" in body ? DEFAULT_MY_SPACE.map((w) => ({ ...w })) : body.widgets;
    await mutate({ ...data, layout }, { revalidate: false });
    try {
      const res = await api.put<{ layout: MySpacePref[] }>("/api/my-space/layout", body);
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

  const header = (
    <PageHeader
      title="My space"
      description={data ? `${data.today.label} · everything in one place` : "Everything in one place"}
      actions={
        <Button variant="outline" size="sm" onClick={() => setCustomizing(true)} disabled={!data}>
          <LayoutGrid className="h-3.5 w-3.5" /> Customise
        </Button>
      }
    />
  );

  if (error && !data) {
    return (
      <>
        {header}
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

  const layout = available(data?.layout ?? DEFAULT_MY_SPACE).filter((w) => w.visible);
  const loading = isLoading && !data;

  return (
    <div aria-busy={loading || undefined}>
      {header}
      {error && data && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-danger-soft px-3.5 py-2 text-[12.5px] text-danger" role="status">
          <span>Couldn&apos;t refresh. Showing the last loaded data.</span>
          <button className="min-h-9 font-medium underline-offset-2 hover:underline" onClick={() => void mutate()}>
            Retry
          </button>
        </div>
      )}

      <div className={cn("grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 min-[1700px]:grid-cols-4")}>
        {layout.map((w) => {
          const Comp = COMPONENTS[w.id] as (p: W.Common & { data: unknown; loading: boolean }) => React.ReactElement;
          const section = data ? (data.sections[w.id] ?? null) : undefined;
          return (
            <Comp
              key={w.id}
              data={retrying.has(w.id) ? undefined : section}
              loading={loading || retrying.has(w.id)}
              size={w.size}
              collapsed={collapsed.includes(w.id)}
              onToggleCollapse={() => toggleCollapse(w.id)}
              onRetry={() => void reload(w.id)}
              reload={() => void reload(w.id)}
              todayKey={data?.today.key ?? ""}
              patch={patch}
            />
          );
        })}
      </div>

      {data && layout.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-[13.5px] text-fg-2">All widgets are hidden. Bring back the ones you like.</p>
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
            <LayoutGrid className="h-3.5 w-3.5" /> Customise
          </Button>
        </Card>
      )}

      {data && (
        <CustomizeMySpace
          open={customizing}
          onOpenChange={setCustomizing}
          layout={available(data.layout)}
          saving={saving}
          onSave={(widgets) => void persist({ widgets }, "My space saved")}
          onReset={() => void persist({ reset: true }, "My space reset to default")}
        />
      )}
      {isLive("/finance") && <TransactionDialogHost />}
    </div>
  );
}
