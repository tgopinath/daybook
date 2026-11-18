"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { CalendarDays, CheckCircle2, Columns3, Flag, Inbox, List, ListTodo, Plus, SearchX, Sun, AlarmClock, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Segmented, SkeletonList } from "@/components/ui/misc";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { isDone, type TaskInit, type TaskList, type WireTask } from "@/components/tasks/types";
import { safeStorage } from "@/components/tasks/utils";
import { useApi } from "@/lib/client";
import { useMe, useTz } from "@/lib/use-me";
import { addDaysKey, dayKey } from "@/lib/time";
import { ListView } from "./_components/list-view";
import { KanbanView } from "./_components/kanban-view";
import { CalendarView } from "./_components/calendar-view";
import { PriorityView } from "./_components/priority-view";
import { BulkBar } from "./_components/bulk-bar";
import { QuickAdd } from "./_components/quick-add";
import { FilterButton, FilterChips, SearchBox, SortMenu } from "./_components/toolbar";
import { EMPTY_FILTERS, buildQuery, sortTasks, type Filters, type SmartList, type SortKey, type ViewMode } from "./_components/shared";

const VIEWS: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: "list", label: "List", icon: List },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "priority", label: "Priority", icon: Flag },
];

const EMPTY: Record<SmartList, { icon: typeof Inbox; title: string; description: string }> = {
  all: { icon: ListTodo, title: "No open tasks", description: "Capture what's on your mind — you can add dates, subtasks and reminders later." },
  today: { icon: Sun, title: "Nothing due today", description: "Enjoy the calm, or pull something forward from Upcoming." },
  upcoming: { icon: CalendarClock, title: "Nothing scheduled", description: "Tasks with a future due date show up here." },
  overdue: { icon: AlarmClock, title: "You're all caught up", description: "No overdue tasks. Nice work." },
  completed: { icon: CheckCircle2, title: "No completed tasks yet", description: "Tasks you check off land here." },
};

function useStored<T extends string>(key: string, initial: T, allowed: readonly T[], urlParam?: string) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    // A URL parameter (e.g. /tasks?view=overdue from the AI panel) wins over the saved choice.
    const fromUrl = urlParam ? (new URLSearchParams(window.location.search).get(urlParam) as T | null) : null;
    const s = fromUrl && allowed.includes(fromUrl) ? fromUrl : (safeStorage().get(key) as T | null);
    if (s && allowed.includes(s)) setV(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setV(next);
      safeStorage().set(key, next);
    },
    [key],
  );
  return [v, set] as const;
}

export default function TasksPage() {
  const tz = useTz();
  const { data: me } = useMe();
  const [list, setList] = useStored<SmartList>("daybook.tasks.list", "all", ["all", "today", "upcoming", "overdue", "completed"], "view");
  const [view, setView] = useStored<ViewMode>("daybook.tasks.view", "list", ["list", "board", "calendar", "priority"]);
  const [sort, setSort] = useStored<SortKey>("daybook.tasks.sort", "manual", ["manual", "due", "priority", "category", "created"]);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(h);
  }, [search]);

  const params = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({
          view: list,
          q,
          priority: filters.priority,
          categoryId: filters.categoryId,
          projectId: filters.projectId,
          tag: filters.tag,
        }).filter(([, v]) => !!v),
      ) as Record<string, string>,
    [list, q, filters],
  );
  const url = view === "calendar" ? null : `/api/tasks?${buildQuery(params)}`;
  const { data, error, isLoading, mutate } = useApi<TaskList>(url);
  // Counts come from any list response; keep the last ones while switching.
  const countsRef = useRef(data?.counts);
  if (data?.counts) countsRef.current = data.counts;
  const { data: countsOnly } = useApi<TaskList>(view === "calendar" ? "/api/tasks?view=today&limit=1" : null);
  const counts = data?.counts ?? countsOnly?.counts ?? countsRef.current;

  const items = useMemo(() => data?.items ?? [], [data]);
  const effectiveSort: SortKey = view === "board" ? "manual" : sort;
  const sorted = useMemo(() => sortTasks(items, list === "completed" ? "manual" : effectiveSort), [items, effectiveSort, list]);
  const open = useMemo(() => (list === "completed" ? sorted : sorted.filter((t) => !isDone(t))), [sorted, list]);
  const done = useMemo(
    () => (list === "completed" ? [] : sorted.filter(isDone).sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))),
    [sorted, list],
  );

  // Visible order for shift-click range selection.
  const visible = useMemo(() => {
    if (view === "priority") return (["HIGH", "MEDIUM", "LOW"] as const).flatMap((p) => open.filter((t) => t.priority === p));
    return [...open, ...done];
  }, [view, open, done]);

  // Drop selections that are no longer visible.
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s;
      const ids = new Set(visible.map((t) => t.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [visible]);

  const onSelect = useCallback(
    (task: WireTask, e: MouseEvent | KeyboardEvent) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && anchor.current) {
          const a = visible.findIndex((t) => t.id === anchor.current);
          const b = visible.findIndex((t) => t.id === task.id);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(visible[i]!.id);
            return next;
          }
        }
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        anchor.current = task.id;
        return next;
      });
    },
    [visible],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && selected.size) setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  const today = dayKey(new Date(), tz);
  const newTaskInit = useCallback((): Partial<TaskInit> => {
    const init: Partial<TaskInit> = {};
    if (list === "today" || list === "overdue") init.dueDate = today;
    if (list === "upcoming") init.dueDate = addDaysKey(today, 1);
    if (filters.priority) init.priority = filters.priority;
    if (filters.categoryId && filters.categoryId !== "none") init.categoryId = filters.categoryId;
    if (filters.projectId && filters.projectId !== "none") init.projectId = filters.projectId;
    return init;
  }, [list, today, filters]);

  const quickDefaults = useMemo(() => newTaskInit(), [newTaskInit]);

  const filtered = !!(q || filters.priority || filters.categoryId || filters.projectId || filters.tag);
  const calendarFilter = useCallback(() => true, []);

  const smartOptions = [
    { value: "all" as const, label: "All", count: counts?.all },
    { value: "today" as const, label: "Today", count: counts?.today },
    { value: "upcoming" as const, label: "Upcoming", count: counts?.upcoming },
    { value: "overdue" as const, label: "Overdue", count: counts?.overdue },
    { value: "completed" as const, label: "Completed", count: counts?.completed },
  ];

  const body = () => {
    if (view === "calendar") return <CalendarView tz={tz} weekStart={me?.settings.weekStart ?? 1} params={params} filter={calendarFilter} />;
    if (error && !data)
      return (
        <Card className="p-8 text-center">
          <p className="text-sm text-fg-2">Couldn't load tasks: {error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Try again
          </Button>
        </Card>
      );
    if (isLoading && !data) return <SkeletonList rows={7} />;
    if (!items.length) {
      const e = filtered ? { icon: SearchX, title: "No matching tasks", description: "Try a different search or clear the filters." } : EMPTY[list];
      return (
        <Card>
          <EmptyState
            icon={e.icon}
            title={e.title}
            description={e.description}
            action={
              filtered ? (
                <Button variant="outline" onClick={() => (setSearch(""), setFilters(EMPTY_FILTERS))}>
                  Clear filters
                </Button>
              ) : list !== "completed" && list !== "overdue" ? (
                <Button onClick={() => openTaskDialog(newTaskInit())}>
                  <Plus className="h-4 w-4" /> New task
                </Button>
              ) : undefined
            }
          />
        </Card>
      );
    }
    if (view === "board") return <KanbanView items={sorted} newTaskInit={newTaskInit} />;
    if (view === "priority")
      return (
        <div className="flex flex-col gap-5">
          <PriorityView items={open} selected={selected} onSelect={onSelect} newTaskInit={newTaskInit} />
          {done.length > 0 && <ListView open={[]} done={done} sortable={false} selected={selected} onSelect={onSelect} />}
        </div>
      );
    return (
      <ListView
        open={open}
        done={done}
        sortable={effectiveSort === "manual" && list !== "completed"}
        selected={selected}
        onSelect={onSelect}
        doneDefaultOpen={list === "today"}
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Tasks"
        description={counts ? `${counts.all} open · ${counts.today} due today${counts.overdue ? ` · ${counts.overdue} overdue` : ""}` : undefined}
        actions={
          <Button onClick={() => openTaskDialog(newTaskInit())}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented value={list} onChange={(v) => (setList(v), setSelected(new Set()))} options={smartOptions} />
            <Segmented value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: v.label, icon: v.icon }))} />
          </div>
          <div className="flex items-center gap-2">
            <SearchBox value={search} onChange={setSearch} />
            <div className="ml-auto flex items-center gap-2">
              <FilterButton filters={filters} onChange={setFilters} />
              {view !== "board" && view !== "calendar" && <SortMenu value={sort} onChange={setSort} />}
            </div>
          </div>
          <FilterChips filters={filters} onChange={setFilters} />
        </div>
      </PageHeader>

      {view === "list" && list !== "completed" && (
        <div className="mb-3">
          <QuickAdd
            defaults={quickDefaults}
            placeholder={list === "today" ? "Add a task for today…" : list === "upcoming" ? "Add a task for tomorrow…" : "Add a task…"}
          />
        </div>
      )}

      {body()}

      <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />
    </div>
  );
}
