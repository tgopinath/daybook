"use client";
import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Clock, GripVertical, Sparkles, Target, X } from "lucide-react";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { useTz } from "@/lib/use-me";
import { addDaysKey, dayKey } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Badge, Card, EmptyState, PageHeader, PRIORITY_META, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { useAIStatus } from "@/components/ai/use-ai";
import { formatDay } from "@/lib/ai/describe";
import { formatHHMM, fromMin, toMin } from "@/lib/ai/slots";
import { NOT_CONFIGURED_MESSAGE, type DaySchedule, type PlanBlock } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const PX_PER_MIN = 1.1;
const DROP_DURATION = 60;

type Unscheduled = DaySchedule["unscheduled"][number];
type Plan = { date: string; summary: string; blocks: (PlanBlock & { key: string })[] };

export function PlannerView() {
  const tz = useTz();
  const today = dayKey(new Date(), tz);
  const [date, setDate] = useState<string | null>(null);
  const day = date ?? today;
  const { data, error, isLoading, mutate } = useApi<DaySchedule>(`/api/ai/day?date=${day}`);
  const { configured } = useAIStatus();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Unscheduled | null>(null);

  useEffect(() => {
    setPlan(null);
    setPlanError(null);
  }, [day]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const afterChange = () => {
    void mutate();
    refresh("/api/tasks", ...SUMMARY_KEYS);
  };

  const schedule = async (blocks: { taskId?: string | null; title?: string; start: string; end: string }[], message: string) => {
    try {
      await api.post("/api/ai/plan/accept", { date: day, blocks });
      toast.success(message);
      afterChange();
      return true;
    } catch (err) {
      toastError(err);
      return false;
    }
  };

  const scheduleInSlot = (task: Unscheduled, slot: { start: string; end: string }) => {
    const start = toMin(slot.start);
    const end = Math.min(toMin(slot.end), start + DROP_DURATION);
    return schedule([{ taskId: task.id, start: slot.start, end: fromMin(end) }], `Scheduled “${task.title}” at ${formatHHMM(slot.start)}`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = e.active.data.current?.task as Unscheduled | undefined;
    const slot = e.over?.data.current?.slot as { start: string; end: string } | undefined;
    if (task && slot) void scheduleInSlot(task, slot);
  };

  const makePlan = async () => {
    setPlanning(true);
    setPlanError(null);
    try {
      const res = await api.post<{ date: string; summary: string; blocks: PlanBlock[] }>("/api/ai/plan", { date: day });
      setPlan({ ...res, blocks: res.blocks.map((b, i) => ({ ...b, key: `${i}-${b.start}` })) });
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  const acceptBlocks = async (blocks: Plan["blocks"]) => {
    const ok = await schedule(
      blocks.map((b) => ({ taskId: b.taskId ?? null, title: b.title, start: b.start, end: b.end })),
      blocks.length === 1 ? `Scheduled “${blocks[0]!.title}”` : `Scheduled ${blocks.length} blocks`,
    );
    if (ok) setPlan((p) => (p ? { ...p, blocks: p.blocks.filter((b) => !blocks.some((x) => x.key === b.key)) } : p));
  };

  const isPast = day < today;

  return (
    <div>
      <PageHeader
        title="Daily planner"
        description={data ? `${formatDay(day)}${data.isToday ? " · today" : ""} · working hours ${formatHHMM(data.workStart)}–${formatHHMM(data.workEnd)}` : formatDay(day)}
        actions={
          <>
            <div className="flex items-center rounded-[10px] border border-line bg-surface">
              <Button size="icon" variant="ghost" aria-label="Previous day" onClick={() => setDate(addDaysKey(day, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <input
                type="date"
                aria-label="Pick a day"
                value={day}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-9 w-[132px] bg-transparent text-center text-[14px] outline-none"
              />
              <Button size="icon" variant="ghost" aria-label="Next day" onClick={() => setDate(addDaysKey(day, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {day !== today && (
              <Button variant="outline" onClick={() => setDate(null)}>
                Today
              </Button>
            )}
            <div title={configured ? undefined : NOT_CONFIGURED_MESSAGE}>
              <Button onClick={makePlan} loading={planning} disabled={!configured || isPast || !data}>
                {!planning && <Sparkles className="h-4 w-4" />}
                Plan my day with AI
              </Button>
            </div>
          </>
        }
      >
        <FocusField date={day} />
        {!configured && <p className="text-[12px] text-fg-3">AI planning needs an API key ({NOT_CONFIGURED_MESSAGE.split("—")[1]?.trim()}). Drag tasks into free slots to plan by hand.</p>}
      </PageHeader>

      {planError && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft/60 px-3 py-2.5 text-[13px] text-danger">
          {planError}
        </p>
      )}

      {error && !data ? (
        <Card className="p-6 text-[13px] text-danger">
          Couldn&apos;t load the day: {error instanceof Error ? error.message : "unknown error"}.{" "}
          <button className="font-medium underline" onClick={() => void mutate()}>
            Retry
          </button>
        </Card>
      ) : !data || (isLoading && data.date !== day) ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[320px] w-full" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={(e) => setDragging((e.active.data.current?.task as Unscheduled) ?? null)} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-4">
              {plan && (
                <PlanPanel
                  plan={plan}
                  onAcceptAll={() => void acceptBlocks(plan.blocks)}
                  onAccept={(b) => void acceptBlocks([b])}
                  onRemove={(b) => setPlan((p) => (p ? { ...p, blocks: p.blocks.filter((x) => x.key !== b.key) } : p))}
                  onDiscard={() => setPlan(null)}
                />
              )}
              <Timeline data={data} plan={plan} dragging={!!dragging} isPast={isPast} />
            </div>
            <Sidebar data={data} isPast={isPast} onSchedule={scheduleInSlot} />
          </div>
          <DragOverlay dropAnimation={null}>{dragging ? <TaskChip task={dragging} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

/* ---------------- Focus ---------------- */

function FocusField({ date }: { date: string }) {
  const { data, mutate } = useApi<{ date: string; focus: string }>(`/api/ai/focus?date=${date}`);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data && data.date === date) setValue(data.focus);
  }, [data, date]);
  const dirty = !!data && value.trim() !== data.focus;
  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await api.put("/api/ai/focus", { focus: value.trim(), date });
      void mutate();
      refresh("/api/me", "/api/ai/day", ...SUMMARY_KEYS);
      toast.success(value.trim() ? "Focus saved" : "Focus cleared");
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Target className="h-4 w-4 shrink-0 text-primary" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => void save()} placeholder="Daily focus — the one thing that would make this day a win" maxLength={280} aria-label="Daily focus" className="max-w-xl" />
      {dirty && (
        <Button type="submit" size="sm" variant="secondary" loading={saving}>
          Save
        </Button>
      )}
    </form>
  );
}

/* ---------------- Timeline ---------------- */

function Timeline({ data, plan, dragging, isPast }: { data: DaySchedule; plan: Plan | null; dragging: boolean; isPast: boolean }) {
  const timed = useMemo(() => [...data.events.filter((e) => !e.allDay), ...data.timedTasks], [data]);
  const allDay = data.events.filter((e) => e.allDay);
  const startMin = Math.floor(Math.max(0, Math.min(toMin(data.workStart), ...timed.map((t) => toMin(t.start)))) / 60) * 60;
  const endMin = Math.ceil(Math.min(1440, Math.max(toMin(data.workEnd), ...timed.map((t) => toMin(t.end)))) / 60) * 60;
  const height = (endMin - startMin) * PX_PER_MIN;
  const y = (t: string) => (toMin(t) - startMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const hasPlan = !!plan?.blocks.length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-fg-3">
        <Legend className="bg-primary-soft border-primary/30" label="Event" />
        <Legend className="bg-surface border-line-strong" label="Scheduled task" />
        <Legend className="border-dashed border-success/50 bg-success-soft/40" label="Free" />
        {hasPlan && <Legend className="border-dashed border-primary bg-primary/10" label="Proposed" />}
      </div>
      {allDay.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <Badge key={e.id} tone="primary">
              All day · {e.title}
            </Badge>
          ))}
        </div>
      )}
      <div className="relative" style={{ height }}>
        {hours.map((m) => (
          <div key={m} className="absolute inset-x-0 flex items-start" style={{ top: (m - startMin) * PX_PER_MIN }}>
            <span className="-mt-2 w-12 shrink-0 pr-2 text-right text-[11px] text-fg-3 tabular-nums">{m < 1440 ? formatHHMM(fromMin(m)) : ""}</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-12">
          {/* Working-hours shading */}
          <div className="absolute inset-x-0 rounded-md bg-surface-2/40" style={{ top: y(data.workStart), height: (toMin(data.workEnd) - toMin(data.workStart)) * PX_PER_MIN }} />
          {data.freeSlots.map((s) => (
            <FreeSlot key={s.start} slot={s} top={y(s.start)} height={s.minutes * PX_PER_MIN} dragging={dragging} narrow={hasPlan} />
          ))}
          {data.events
            .filter((e) => !e.allDay)
            .map((e) => (
              <Block key={e.id} top={y(e.start)} height={(toMin(e.end) - toMin(e.start)) * PX_PER_MIN} narrow={hasPlan} className="border-primary/30 bg-primary-soft text-primary">
                <span className="font-medium">{e.title}</span>
                <span className="opacity-70">
                  {formatHHMM(e.start)}–{formatHHMM(e.end)}
                </span>
              </Block>
            ))}
          {data.timedTasks.map((t) => (
            <Block key={t.id} top={y(t.start)} height={(toMin(t.end) - toMin(t.start)) * PX_PER_MIN} narrow={hasPlan} className="cursor-pointer border-line-strong bg-surface hover:border-primary/50" onClick={() => openTaskDialog({ id: t.id })}>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_META[t.priority].color }} />
                {t.title}
              </span>
              <span className="text-fg-3">
                {formatHHMM(t.start)}–{formatHHMM(t.end)}
              </span>
            </Block>
          ))}
          {hasPlan &&
            plan!.blocks.map((b) => (
              <div
                key={b.key}
                className="absolute right-0 left-1/2 ml-1 overflow-hidden rounded-lg border border-dashed border-primary bg-primary/10 px-2 py-1 text-[12px] text-primary"
                style={{ top: y(b.start) + 1, height: Math.max(20, (toMin(b.end) - toMin(b.start)) * PX_PER_MIN - 2) }}
              >
                <span className="block truncate font-medium">{b.title}</span>
                <span className="block truncate opacity-75">
                  {formatHHMM(b.start)}–{formatHHMM(b.end)}
                </span>
              </div>
            ))}
          {data.now && toMin(data.now) >= startMin && toMin(data.now) <= endMin && (
            <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: y(data.now) }}>
              <span className="-ml-1 h-2 w-2 rounded-full bg-danger" />
              <div className="h-px flex-1 bg-danger" />
            </div>
          )}
        </div>
      </div>
      {!data.freeSlots.length && (
        <p className="mt-3 text-[12.5px] text-fg-3">{isPast ? "This day is in the past." : "No free time left inside working hours."}</p>
      )}
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded border", className)} />
      {label}
    </span>
  );
}

function Block({ top, height, className, children, onClick, narrow }: { top: number; height: number; className: string; children: React.ReactNode; onClick?: () => void; narrow?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={cn("absolute left-0 flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-[12px] leading-tight", narrow ? "right-1/2 mr-1" : "right-0", className)}
      style={{ top: top + 1, height: Math.max(20, height - 2) }}
    >
      {children}
    </div>
  );
}

function FreeSlot({ slot, top, height, dragging, narrow }: { slot: DaySchedule["freeSlots"][number]; top: number; height: number; dragging: boolean; narrow: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slot.start}`, data: { slot } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute left-0 flex items-start rounded-lg border border-dashed px-2 py-1 text-[11.5px] transition-colors",
        narrow ? "right-1/2 mr-1" : "right-0",
        isOver ? "border-success bg-success-soft text-success" : dragging ? "border-success/60 bg-success-soft/60 text-success" : "border-success/40 bg-success-soft/25 text-success/80",
      )}
      style={{ top: top + 1, height: Math.max(18, height - 2) }}
    >
      {height >= 18 && (
        <span className="truncate">
          Free {formatHHMM(slot.start)}–{formatHHMM(slot.end)} · {slot.minutes >= 60 ? `${Math.floor(slot.minutes / 60)}h${slot.minutes % 60 ? ` ${slot.minutes % 60}m` : ""}` : `${slot.minutes}m`}
          {dragging && " · drop here"}
        </span>
      )}
    </div>
  );
}

/* ---------------- Plan panel ---------------- */

function PlanPanel({ plan, onAcceptAll, onAccept, onRemove, onDiscard }: { plan: Plan; onAcceptAll: () => void; onAccept: (b: Plan["blocks"][number]) => void; onRemove: (b: Plan["blocks"][number]) => void; onDiscard: () => void }) {
  return (
    <Card className="border-primary/30 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Proposed plan</h2>
          {plan.summary && <p className="mt-0.5 text-[13px] text-fg-2">{plan.summary}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" onClick={onAcceptAll} disabled={!plan.blocks.length}>
            <Check className="h-3.5 w-3.5" /> Accept all
          </Button>
        </div>
      </div>
      {plan.blocks.length ? (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {plan.blocks.map((b) => (
            <li key={b.key} className="flex items-center gap-3 py-2">
              <span className="w-[104px] shrink-0 text-[12px] text-fg-2 tabular-nums">
                {formatHHMM(b.start)}–{formatHHMM(b.end)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {b.title}
                  {!b.taskId && <span className="ml-1.5 text-[11px] font-normal text-fg-3">(new task)</span>}
                </p>
                {b.reason && <p className="truncate text-[12px] text-fg-3">{b.reason}</p>}
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`Skip ${b.title}`} onClick={() => onRemove(b)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAccept(b)}>
                Accept
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-fg-3">All blocks handled.</p>
      )}
    </Card>
  );
}

/* ---------------- Sidebar: unscheduled tasks ---------------- */

function Sidebar({ data, isPast, onSchedule }: { data: DaySchedule; isPast: boolean; onSchedule: (t: Unscheduled, slot: { start: string; end: string }) => Promise<boolean> }) {
  const overdue = data.unscheduled.filter((t) => t.overdue);
  const due = data.unscheduled.filter((t) => !t.overdue);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-fg-3" />
          <h2 className="flex-1 text-[15px] font-semibold">Unscheduled</h2>
          <span className="text-[12px] text-fg-3 tabular-nums">{data.unscheduled.length}</span>
        </div>
        <p className="mb-3 text-[12px] text-fg-3">{isPast ? "This day is in the past." : "Drag a task onto a free slot, or use the clock button."}</p>
        {!data.unscheduled.length ? (
          <EmptyState
            icon={Check}
            title="Nothing to schedule"
            description="Every task due this day already has a time."
            className="py-6"
            action={
              <Button size="sm" variant="secondary" onClick={() => openTaskDialog({ dueDate: data.date })}>
                Add a task
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {due.length > 0 && <TaskGroup title={data.isToday ? "Due today" : "Due this day"} tasks={due} slots={data.freeSlots} onSchedule={onSchedule} disabled={isPast} />}
            {overdue.length > 0 && <TaskGroup title="Overdue" tasks={overdue} slots={data.freeSlots} onSchedule={onSchedule} disabled={isPast} />}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-fg-3" />
          <h2 className="text-[15px] font-semibold">Free time</h2>
        </div>
        {data.freeSlots.length ? (
          <ul className="flex flex-col gap-1 text-[14px]">
            {data.freeSlots.map((s) => (
              <li key={s.start} className="flex justify-between">
                <span className="tabular-nums">
                  {formatHHMM(s.start)}–{formatHHMM(s.end)}
                </span>
                <span className="text-fg-3">{s.minutes} min</span>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1.5 text-[12px] text-fg-3">{Math.round((data.freeSlots.reduce((a, s) => a + s.minutes, 0) / 60) * 10) / 10}h free inside working hours</li>
          </ul>
        ) : (
          <p className="text-[12.5px] text-fg-3">No free slots.</p>
        )}
      </Card>
    </div>
  );
}

function TaskGroup({ title, tasks, slots, onSchedule, disabled }: { title: string; tasks: Unscheduled[]; slots: DaySchedule["freeSlots"]; onSchedule: (t: Unscheduled, s: { start: string; end: string }) => Promise<boolean>; disabled: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {tasks.map((t) => (
          <li key={t.id}>
            <DraggableTask task={t} slots={slots} onSchedule={onSchedule} disabled={disabled} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraggableTask({ task, slots, onSchedule, disabled }: { task: Unscheduled; slots: DaySchedule["freeSlots"]; onSchedule: (t: Unscheduled, s: { start: string; end: string }) => Promise<boolean>; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task }, disabled: disabled || !slots.length });
  return (
    <div ref={setNodeRef} className={cn("flex items-center gap-1", isDragging && "opacity-40")}>
      <div className="min-w-0 flex-1" {...listeners} {...attributes}>
        <TaskChip task={task} draggable={!disabled && slots.length > 0} />
      </div>
      <Menu
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label={`Schedule ${task.title}`} disabled={disabled || !slots.length}>
            <Clock className="h-3.5 w-3.5" />
          </Button>
        }
        items={[
          { type: "label", label: "Schedule at" },
          ...slots.slice(0, 8).map((s) => ({ label: `${formatHHMM(s.start)} (${Math.min(DROP_DURATION, s.minutes)} min)`, onSelect: () => void onSchedule(task, s) })),
        ]}
      />
    </div>
  );
}

function TaskChip({ task, draggable, overlay }: { task: Unscheduled; draggable?: boolean; overlay?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[10px] border border-line bg-surface px-2 py-2 text-[14px]",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        overlay && "shadow-pop",
      )}
    >
      {draggable && <GripVertical className="h-3.5 w-3.5 shrink-0 text-fg-3" />}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_META[task.priority].color }} />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {task.goal && <Target className="h-3 w-3 shrink-0 text-fg-3" aria-label={`Goal: ${task.goal}`} />}
    </div>
  );
}
