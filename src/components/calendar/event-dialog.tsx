"use client";
import { useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Copy, Link2, MapPin, Plus, Repeat, Search, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { DemoBadge, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { create } from "@/components/ui/store";
import { api, useApi } from "@/lib/client";
import { useMe, useTz } from "@/lib/use-me";
import { addDaysKey, dayKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { deleteEvent, refreshCalendar } from "./actions";
import type { CalCategory, CalEvent, EventKind, EventRecurrence } from "./types";
import { KIND_META, PALETTE, REMINDER_OPTIONS, hhmm, keyMinutesToMs, minutesOfDay } from "./utils";

type Init = { id?: string; start?: number; end?: number; allDay?: boolean; kind?: EventKind };

const store = create<{ open: boolean; init: Init; seq: number }>({ open: false, init: {}, seq: 0 });

/** Open the event editor. Pass `id` to edit, or start/end (ms) to prefill a new event. */
export function openEventDialog(init: Init = {}) {
  store.set((s) => ({ open: true, init, seq: s.seq + 1 }));
}

type TaskLite = { id: string; title: string; status?: string; dueDate?: string | null; isDemo?: boolean };

function asArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

type Form = {
  title: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  kind: EventKind;
  color: string | null;
  categoryId: string;
  recurrence: EventRecurrence;
  reminder: string;
  taskIds: string[];
};

function formFromEvent(e: CalEvent, tz: string): Form {
  const s = Date.parse(e.start);
  const en = Date.parse(e.end);
  return {
    title: e.title,
    description: e.description ?? "",
    location: e.location ?? "",
    startDate: dayKey(new Date(s), tz),
    startTime: hhmm(minutesOfDay(s, tz)),
    endDate: e.allDay ? dayKey(new Date(Math.max(s, en - 1)), tz) : dayKey(new Date(en), tz),
    endTime: hhmm(minutesOfDay(en, tz)),
    allDay: e.allDay,
    kind: e.kind,
    color: e.color,
    categoryId: e.categoryId ?? "",
    recurrence: e.recurrence,
    reminder: e.reminderMinutes == null ? "" : String(e.reminderMinutes),
    taskIds: e.taskIds,
  };
}

function formFromInit(init: Init, tz: string, workStart: string): Form {
  const today = dayKey(new Date(), tz);
  let s = init.start;
  if (s == null) {
    // Next round hour, or the start of the working day.
    const now = Date.now();
    const nextHour = Math.ceil((minutesOfDay(now, tz) + 1) / 60) * 60;
    s = nextHour < 23 * 60 ? keyMinutesToMs(today, nextHour, tz) : keyMinutesToMs(addDaysKey(today, 1), Number(workStart.split(":")[0]) * 60, tz);
  }
  const e = init.end ?? s + 3600000;
  const allDay = !!init.allDay;
  return {
    title: "",
    description: "",
    location: "",
    startDate: dayKey(new Date(s), tz),
    startTime: hhmm(minutesOfDay(s, tz)),
    endDate: allDay ? dayKey(new Date(Math.max(s, e - 1)), tz) : dayKey(new Date(e), tz),
    endTime: hhmm(minutesOfDay(e, tz)),
    allDay,
    kind: init.kind ?? "event",
    color: null,
    categoryId: "",
    recurrence: init.kind === "birthday" ? "YEARLY" : "NONE",
    reminder: "",
    taskIds: [],
  };
}

export function EventDialogHost() {
  const { open, init, seq } = store.use();
  return <EventDialog key={seq} open={open} init={init} onClose={() => store.set({ open: false })} />;
}

function EventDialog({ open, init, onClose }: { open: boolean; init: Init; onClose: () => void }) {
  const tz = useTz();
  const { data: me } = useMe();
  const editing = !!init.id;
  const { data: existing, error: loadError } = useApi<{ item: CalEvent }>(open && init.id ? `/api/events/${init.id}` : null, { revalidateOnFocus: false });
  const { data: catData } = useApi<unknown>(open ? "/api/categories" : null, { shouldRetryOnError: false, revalidateOnFocus: false });
  const categories = useMemo(
    () => asArray<CalCategory & { kind?: string }>(catData, ["items", "categories"]).filter((c) => !c.kind || c.kind === "general" || c.kind === "event"),
    [catData],
  );

  const [form, setForm] = useState<Form | null>(() => (editing ? null : formFromInit(init, tz, me?.settings.workStart ?? "09:00")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing && existing?.item && !form) setForm(formFromEvent(existing.item, tz));
  }, [editing, existing, form, tz]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  /** Changing the start time keeps the event's duration. */
  const shiftStartTime = (v: string) =>
    setForm((f) => {
      if (!f || !v) return f ? { ...f, startTime: v } : f;
      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      const dayDiff = Math.round((Date.parse(f.endDate) - Date.parse(f.startDate)) / 86400000);
      const dur = dayDiff * 1440 + toMin(f.endTime) - toMin(f.startTime);
      const endAbs = toMin(v) + Math.max(dur, 15);
      return { ...f, startTime: v, endDate: addDaysKey(f.startDate, Math.floor(endAbs / 1440)), endTime: hhmm(endAbs % 1440) };
    });

  const ev = existing?.item;
  const color = form ? form.color || categories.find((c) => c.id === form.categoryId)?.color || KIND_META[form.kind].color : PALETTE[0]!;

  function payload(f: Form) {
    let start: number;
    let end: number;
    if (f.allDay) {
      start = keyMinutesToMs(f.startDate, 0, tz);
      end = keyMinutesToMs(addDaysKey(f.endDate < f.startDate ? f.startDate : f.endDate, 1), 0, tz);
    } else {
      const [sh, sm] = f.startTime.split(":").map(Number);
      const [eh, em] = f.endTime.split(":").map(Number);
      start = keyMinutesToMs(f.startDate, sh! * 60 + sm!, tz);
      end = keyMinutesToMs(f.endDate, eh! * 60 + em!, tz);
    }
    return {
      title: f.title.trim(),
      description: f.description.trim() || null,
      location: f.location.trim() || null,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      allDay: f.allDay,
      kind: f.kind,
      color: f.color,
      categoryId: f.categoryId || null,
      recurrence: f.recurrence,
      reminderMinutes: f.reminder === "" ? null : Number(f.reminder),
      taskIds: f.taskIds,
      _valid: end > start || (f.allDay && end >= start),
    };
  }

  async function save() {
    if (!form) return;
    if (!form.title.trim()) return setError("Give the event a title");
    if (!form.startDate || !form.endDate || (!form.allDay && (!form.startTime || !form.endTime))) return setError("Pick a start and end");
    const { _valid, ...data } = payload(form);
    if (!_valid) return setError("End must be after start");
    setSaving(true);
    setError(null);
    try {
      if (editing) await api.patch(`/api/events/${init.id}`, data);
      else await api.post(`/api/events`, data);
      await refreshCalendar();
      toast.success(editing ? "Event updated" : data.reminderMinutes != null ? "Event created with a reminder" : "Event created");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!form) return;
    const { _valid, ...data } = payload(form);
    if (!_valid) return setError("End must be after start");
    try {
      await api.post(`/api/events`, { ...data, title: `${data.title} (copy)`, taskIds: [] });
      await refreshCalendar();
      toast.success("Event duplicated");
      onClose();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove() {
    if (!init.id || !ev) return;
    if (await deleteEvent(ev)) onClose();
  }

  const footer = (
    <div className="flex w-full items-center gap-2">
      {editing && (
        <>
          <Button variant="ghost" size="icon" aria-label="Delete event" title="Delete" onClick={remove} disabled={!ev} className="text-danger hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Duplicate event" title="Duplicate" onClick={duplicate} disabled={!form}>
            <Copy className="h-4 w-4" />
          </Button>
        </>
      )}
      <div className="flex-1" />
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={save} loading={saving} disabled={!form}>
        {editing ? "Save" : "Create event"}
      </Button>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {editing ? "Edit event" : "New event"}
          <DemoBadge show={ev?.isDemo} />
        </span>
      }
      description={editing && ev?.recurrence && ev.recurrence !== "NONE" ? "Changes apply to every occurrence of this series." : undefined}
      footer={footer}
    >
      {loadError ? (
        <p className="py-6 text-center text-sm text-danger">Couldn&apos;t load this event. It may have been deleted.</p>
      ) : !form ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus={!editing}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Event title"
            aria-label="Title"
            className="w-full border-0 bg-transparent text-[18px] font-semibold tracking-tight outline-none placeholder:text-fg-3"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(KIND_META) as EventKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  set("kind", k);
                  if (k === "birthday") {
                    set("allDay", true);
                    set("recurrence", "YEARLY");
                  }
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  form.kind === k ? "border-transparent text-fg" : "border-line text-fg-2 hover:bg-surface-2",
                )}
                style={form.kind === k ? { background: `color-mix(in srgb, ${KIND_META[k].color} 16%, var(--surface))` } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_META[k].color }} />
                {KIND_META[k].label}
              </button>
            ))}
          </div>

          <div className="rounded-[12px] border border-line p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-fg-2">All day</span>
              <Switch checked={form.allDay} onChange={(v) => set("allDay", v)} label="All day" />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="date"
                aria-label="Start date"
                value={form.startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    if (!f || !v) return f;
                    // Keep the duration when the start date changes.
                    const span = Math.round((Date.parse(f.endDate) - Date.parse(f.startDate)) / 86400000);
                    return { ...f, startDate: v, endDate: addDaysKey(v, Math.max(0, span || 0)) };
                  });
                }}
              />
              {!form.allDay && <Input type="time" aria-label="Start time" step={300} value={form.startTime} onChange={(e) => shiftStartTime(e.target.value)} className="w-[120px]" />}
              <Input type="date" aria-label="End date" value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} />
              {!form.allDay && <Input type="time" aria-label="End time" step={300} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className="w-[120px]" />}
            </div>
            <p className="mt-2 text-xs text-fg-3">Times are in {tz.replace(/_/g, " ")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Repeat">
              <div className="relative">
                <Repeat className="pointer-events-none absolute top-1/2 left-3 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
                <Select value={form.recurrence} onChange={(e) => set("recurrence", e.target.value as EventRecurrence)} className="pl-8">
                  <option value="NONE">Does not repeat</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </Select>
              </div>
            </Field>
            <Field label="Reminder">
              <Select value={form.reminder} onChange={(e) => set("reminder", e.target.value)}>
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Location">
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Add a place or link" className="pl-8" />
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={form.categoryId}
                onChange={(e) => {
                  const id = e.target.value;
                  setForm((f) => (f ? { ...f, categoryId: id, color: id ? null : f.color } : f));
                }}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg-2">Color</span>
              <div className="flex h-9 flex-wrap items-center gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => set("color", form.color === c ? null : c)}
                    className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
                    style={{ background: c, boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : undefined }}
                  >
                    {color === c && <Check className="h-3 w-3 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Notes, agenda, links…" />
          </Field>

          <TaskLinker value={form.taskIds} onChange={(v) => set("taskIds", v)} linked={ev?.tasks ?? []} />

          {error && <p className="text-[13px] text-danger">{error}</p>}
          <button type="submit" className="hidden" />
        </form>
      )}
    </Dialog>
  );
}

function TaskLinker({ value, onChange, linked }: { value: string[]; onChange: (v: string[]) => void; linked: TaskLite[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useApi<unknown>("/api/tasks", { shouldRetryOnError: false, revalidateOnFocus: false });
  const all = useMemo(() => {
    const list = asArray<TaskLite>(data, ["items", "tasks"]);
    const map = new Map<string, TaskLite>();
    for (const t of linked) map.set(t.id, t);
    for (const t of list) map.set(t.id, t);
    return [...map.values()];
  }, [data, linked]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const filtered = all.filter((t) => t.status !== "COMPLETED" || value.includes(t.id)).filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg-2">Linked tasks</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface-2 pr-1 pl-2 text-xs">
            <span className="truncate">{byId.get(id)?.title ?? "Task"}</span>
            <button type="button" onClick={() => toggle(id)} aria-label="Unlink task" className="rounded p-0.5 text-fg-3 hover:bg-line hover:text-fg">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button type="button" className="inline-flex h-7 items-center gap-1 rounded-lg border border-dashed border-line-strong px-2 text-xs text-fg-2 hover:bg-surface-2 hover:text-fg">
              {value.length ? <Plus className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
              {value.length ? "Add" : "Link tasks"}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={6} className="z-[70] w-[300px] rounded-xl border border-line bg-surface p-1.5 shadow-pop">
              <div className="relative mb-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="h-8 w-full rounded-lg bg-surface-2 pr-2 pl-8 text-[13px] outline-none" />
              </div>
              <div className="max-h-[240px] overflow-y-auto scroll-thin">
                {isLoading && !all.length ? (
                  <p className="px-2 py-3 text-xs text-fg-3">Loading tasks…</p>
                ) : error && !all.length ? (
                  <p className="px-2 py-3 text-xs text-fg-3">Tasks are unavailable right now.</p>
                ) : filtered.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-fg-3">No matching tasks</p>
                ) : (
                  filtered.map((t) => {
                    const on = value.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(t.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                      >
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-white" : "border-line-strong")}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className={cn("flex-1 truncate", t.status === "COMPLETED" && "text-fg-3 line-through")}>{t.title}</span>
                        <DemoBadge show={t.isDemo} />
                      </button>
                    );
                  })
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
