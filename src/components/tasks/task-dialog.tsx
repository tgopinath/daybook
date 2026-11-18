"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Download, GripVertical, Paperclip, Plus, Trash2, X, Upload, Loader2 } from "lucide-react";
import { create } from "@/components/ui/store";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { PRIORITY_META, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { api, useApi, refresh } from "@/lib/client";
import { useMe, useTz } from "@/lib/use-me";
import { browserTz, dayKey, zonedToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";
import { deleteTask, refreshTasks, updateTask } from "./actions";
import { PriorityFlag, TagInput } from "./pickers";
import { fmtBytes, timeOfDay } from "./utils";
import { RECURRENCE_OPTIONS, STATUS_META, STATUS_ORDER, type Priority, type TaskInit, type TaskStatus, type WireAttachment, type WireTask, type Recurrence } from "./types";

export type { TaskInit } from "./types";

/* ------------------------------------------------------------------ */
/* Global store                                                        */
/* ------------------------------------------------------------------ */

type DialogState = { open: boolean; id: string | null; init: Partial<TaskInit>; nonce: number };
const store = create<DialogState>({ open: false, id: null, init: {}, nonce: 0 });

/** Open the task dialog: create (optionally prefilled) or edit when `id` is given. */
export function openTaskDialog(init?: Partial<TaskInit> & { id?: string }) {
  const { id, ...rest } = init ?? {};
  store.set((s) => ({ open: true, id: id ?? null, init: rest, nonce: s.nonce + 1 }));
}

export function closeTaskDialog() {
  store.set({ open: false });
}

export function TaskDialogHost() {
  const s = store.use();
  if (!s.nonce) return null;
  return <TaskDialog key={s.nonce} open={s.open} id={s.id} init={s.init} />;
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

type SubItem = { key: string; id?: string; title: string; done: boolean };
type Form = {
  title: string;
  description: string;
  dueDay: string;
  startTime: string;
  endTime: string;
  priority: Priority;
  status: TaskStatus;
  categoryId: string;
  projectId: string;
  goalId: string;
  milestoneId: string;
  eventId: string;
  recurrence: Recurrence;
  reminderLocal: string;
  tags: string[];
  subtasks: SubItem[];
};

let keySeq = 0;
const newKey = () => `s${++keySeq}`;

function toDayKey(v: string | null | undefined, tz: string) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d, tz);
}
function toLocalDateTime(v: string | null | undefined, tz: string) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${dayKey(d, tz)}T${timeOfDay(d, tz)}`;
}

function formFrom(src: Partial<TaskInit> & Partial<Pick<WireTask, "subtasks">>, tz: string, defaultPriority: Priority): Form {
  return {
    title: src.title ?? "",
    description: src.description ?? "",
    dueDay: toDayKey(src.dueDate, tz),
    startTime: src.startTime ?? "",
    endTime: src.endTime ?? "",
    priority: src.priority ?? defaultPriority,
    status: src.status ?? "NOT_STARTED",
    categoryId: src.categoryId ?? "",
    projectId: src.projectId ?? "",
    goalId: src.goalId ?? "",
    milestoneId: src.milestoneId ?? "",
    eventId: src.eventId ?? "",
    recurrence: src.recurrence ?? "NONE",
    reminderLocal: toLocalDateTime(src.reminderAt, tz),
    tags: src.tags ?? [],
    subtasks: (src.subtasks ?? []).map((s) => ({ key: newKey(), id: s.id, title: s.title, done: s.done })),
  };
}

function TaskDialog({ open, id, init }: { open: boolean; id: string | null; init: Partial<TaskInit> }) {
  const tz = useTz();
  const { data: me } = useMe();
  const defaultPriority = (me?.settings.defaultPriority ?? "MEDIUM") as Priority;
  const { data, error, isLoading } = useApi<{ item: WireTask }>(id ? `/api/tasks/${id}` : null, { revalidateOnFocus: false });
  const task = data?.item ?? null;

  const [form, setForm] = useState<Form | null>(() => (id ? null : formFrom(init, tz, defaultPriority)));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [queued, setQueued] = useState<File[]>([]);

  // Hydrate once the task arrives (edit mode).
  useEffect(() => {
    if (id && task && !form) {
      setForm(
        formFrom(
          {
            ...task,
            description: task.description ?? "",
            tags: task.tags.map((t) => t.name),
          },
          tz,
          defaultPriority,
        ),
      );
    }
  }, [id, task, form, tz, defaultPriority]);

  // New task: apply the user's default priority once settings load (unless prefilled).
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (!id && me && !appliedDefault.current && !init.priority) {
      appliedDefault.current = true;
      setForm((f) => (f ? { ...f, priority: defaultPriority } : f));
    }
  }, [id, me, init.priority, defaultPriority]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const close = () => store.set({ open: false });

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!form || saving) return;
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Give the task a title";
    if (form.startTime && form.endTime && form.endTime < form.startTime) errs.endTime = "End time is before start time";
    if (form.recurrence !== "NONE" && !form.dueDay) errs.dueDay = "Repeating tasks need a due date";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const [rDay, rTime] = form.reminderLocal.split("T");
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() ? form.description : null,
      dueDate: form.dueDay || null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      priority: form.priority,
      categoryId: form.categoryId || null,
      projectId: form.projectId || null,
      goalId: form.goalId || null,
      milestoneId: form.goalId ? form.milestoneId || null : null,
      eventId: form.eventId || null,
      recurrence: form.recurrence,
      reminderAt: rDay && rTime ? zonedToUtc(rDay, rTime, tz).toISOString() : null,
      tags: form.tags,
      subtasks: form.subtasks.filter((s) => s.title.trim()).map((s) => ({ id: s.id, title: s.title.trim(), done: s.done })),
    };
    setSaving(true);
    try {
      if (id) {
        await updateTask(id, { ...payload, ...(task && form.status !== task.status ? { status: form.status } : {}) });
        toast.success("Task saved");
      } else {
        const res = await api.post<{ item: WireTask }>("/api/tasks", { ...payload, status: form.status });
        if (queued.length) await uploadAll(res.item.id, queued);
        refreshTasks();
        toast.success("Task created", { action: { label: "Open", onClick: () => openTaskDialog({ id: res.item.id }) } });
      }
      close();
    } catch (err) {
      if (!id) toastError(err); // updateTask already toasts
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex w-full items-center gap-2">
      {id && task && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => {
            close();
            void deleteTask(task);
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
      <span className="mr-auto hidden text-[11.5px] text-fg-3 sm:inline">⌘↵ to save</span>
      <Button variant="ghost" onClick={close}>
        Cancel
      </Button>
      <Button type="submit" form="task-form" loading={saving} disabled={!form}>
        {id ? "Save" : "Create task"}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={id ? "Edit task" : "New task"} size="lg" footer={footer}>
      {id && error && !task ? (
        <p className="py-10 text-center text-sm text-fg-2">{error.message || "Couldn't load this task."}</p>
      ) : !form || (id && isLoading && !task) ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : (
        <form
          id="task-form"
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          className="grid gap-5 md:grid-cols-[minmax(0,1fr)_236px]"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <input
                autoFocus={!id}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="What needs to be done?"
                aria-label="Title"
                maxLength={300}
                className="w-full bg-transparent text-[18px] font-semibold tracking-tight outline-none placeholder:text-fg-3"
              />
              {errors.title && <p className="mt-1 text-xs text-danger">{errors.title}</p>}
            </div>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Add details, links or notes…" aria-label="Description" rows={3} />
            <SubtaskEditor items={form.subtasks} onChange={(v) => set("subtasks", v)} />
            <Attachments taskId={id} existing={task?.attachments ?? []} queued={queued} onQueue={setQueued} />
          </div>

          <aside className="flex flex-col gap-3 md:border-l md:border-line md:pl-5">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg-2">Priority</span>
              <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-surface-2 p-0.5" role="radiogroup" aria-label="Priority">
                {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={form.priority === p}
                    onClick={() => set("priority", p)}
                    className={cn("flex h-8 items-center justify-center gap-1 rounded-lg text-[12.5px] font-medium", form.priority === p ? "bg-surface shadow-card" : "text-fg-2 hover:text-fg")}
                  >
                    <PriorityFlag priority={p} className="h-3 w-3" />
                    {PRIORITY_META[p].label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Due date" error={errors.dueDay}>
              <div className="flex gap-1.5">
                <Input type="date" value={form.dueDay} onChange={(e) => set("dueDay", e.target.value)} />
                {form.dueDay && (
                  <Button variant="ghost" size="icon" aria-label="Clear due date" onClick={() => set("dueDay", "")}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </Field>
              <Field label="End" error={errors.endTime}>
                <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </Field>
            </div>
            <Field label="Repeat" hint={form.recurrence !== "NONE" ? "Next one is created when you complete this" : undefined}>
              <Select value={form.recurrence} onChange={(e) => set("recurrence", e.target.value as Recurrence)}>
                {RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {!RECURRENCE_OPTIONS.some((o) => o.value === form.recurrence) && <option value={form.recurrence}>{form.recurrence.toLowerCase()}</option>}
              </Select>
            </Field>
            <Field label="Reminder" hint={form.reminderLocal ? `Notifies you (${tz})` : undefined}>
              <div className="flex gap-1.5">
                <Input type="datetime-local" value={form.reminderLocal} onChange={(e) => set("reminderLocal", e.target.value)} />
                {form.reminderLocal && (
                  <Button variant="ghost" size="icon" aria-label="Clear reminder" onClick={() => set("reminderLocal", "")}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Field>
            <RefPicker kind="category" value={form.categoryId} onChange={(v) => set("categoryId", v)} />
            <RefPicker kind="project" value={form.projectId} onChange={(v) => set("projectId", v)} />
            <Field label="Tags">
              <TagInput value={form.tags} onChange={(v) => set("tags", v)} />
            </Field>
            <GoalPicker goalId={form.goalId} milestoneId={form.milestoneId} onChange={(g, m) => setForm((f) => (f ? { ...f, goalId: g, milestoneId: m } : f))} current={task?.goal ?? null} />
            <EventPicker value={form.eventId} onChange={(v) => set("eventId", v)} current={task?.event ?? null} />
          </aside>
        </form>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pickers                                                             */
/* ------------------------------------------------------------------ */

function RefPicker({ kind, value, onChange }: { kind: "category" | "project"; value: string; onChange: (v: string) => void }) {
  const url = kind === "category" ? "/api/categories?kind=task" : "/api/projects";
  const { data, error } = useApi<{ items: { id: string; name: string }[] }>(url);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "category" ? "Category" : "Project";

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ item: { id: string } }>(kind === "category" ? "/api/categories" : "/api/projects", {
        name: name.trim(),
        ...(kind === "category" ? { kind: "task" } : {}),
      });
      await refresh(kind === "category" ? "/api/categories" : "/api/projects");
      onChange(res.item.id);
      setAdding(false);
      setName("");
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  if (adding)
    return (
      <Field label={`New ${label.toLowerCase()}`}>
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void add();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
              }
            }}
            placeholder={`${label} name`}
            maxLength={kind === "category" ? 60 : 80}
          />
          <Button size="icon" onClick={() => void add()} loading={busy} aria-label={`Add ${label.toLowerCase()}`}>
            {!busy && <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </Field>
    );

  return (
    <Field label={label} error={error ? `Couldn't load ${label.toLowerCase()}s` : undefined}>
      <Select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__new") setAdding(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">No {label.toLowerCase()}</option>
        {(data?.items ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new">+ New {label.toLowerCase()}…</option>
      </Select>
    </Field>
  );
}

type GoalLite = { id: string; title: string; milestones?: { id: string; title: string; done?: boolean }[] };

function GoalPicker({ goalId, milestoneId, onChange, current }: { goalId: string; milestoneId: string; onChange: (goalId: string, milestoneId: string) => void; current: { id: string; title: string } | null }) {
  const { data, error } = useApi<{ items: GoalLite[] }>("/api/goals");
  const goals = useMemo(() => {
    const list = Array.isArray(data?.items) ? data!.items : [];
    if (current && !list.some((g) => g.id === current.id)) return [{ id: current.id, title: current.title }, ...list];
    return list;
  }, [data, current]);
  const selected = goals.find((g) => g.id === goalId);
  const { data: detail } = useApi<{ item?: GoalLite } & Partial<GoalLite>>(goalId && !selected?.milestones ? `/api/goals/${goalId}` : null, { shouldRetryOnError: false });
  const milestones = selected?.milestones ?? detail?.item?.milestones ?? detail?.milestones ?? [];
  return (
    <>
      <Field label="Goal" hint={error ? "Goals aren't available right now" : undefined}>
        <Select value={goalId} disabled={!!error && !goals.length} onChange={(e) => onChange(e.target.value, "")}>
          <option value="">No goal</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
      </Field>
      {goalId && milestones.length > 0 && (
        <Field label="Milestone">
          <Select value={milestoneId} onChange={(e) => onChange(goalId, e.target.value)}>
            <option value="">No milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.done ? "✓ " : ""}
                {m.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
}

function EventPicker({ value, onChange, current }: { value: string; onChange: (v: string) => void; current: { id: string; title: string; start: string } | null }) {
  const tz = useTz();
  const { data, error } = useApi<{ items: { id: string; title: string; start: string }[] }>("/api/events");
  const events = useMemo(() => {
    const seen = new Set<string>();
    const list = [...(current ? [current] : []), ...(Array.isArray(data?.items) ? data!.items : [])].filter((e) => {
      // recurring occurrences may repeat the same id
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    return list.slice(0, 100);
  }, [data, current]);
  return (
    <Field label="Calendar event" hint={error ? "Events aren't available right now" : undefined}>
      <Select value={value} disabled={!!error && !events.length} onChange={(e) => onChange(e.target.value)}>
        <option value="">No event</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.title}
            {ev.start ? ` · ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(ev.start))}` : ""}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Subtasks                                                            */
/* ------------------------------------------------------------------ */

function SubtaskEditor({ items, onChange }: { items: SubItem[]; onChange: (v: SubItem[]) => void }) {
  const [text, setText] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = items.filter((s) => s.done).length;
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { key: newKey(), title: t.slice(0, 300), done: false }]);
    setText("");
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((s) => s.key === e.active.id);
    const to = items.findIndex((s) => s.key === e.over!.id);
    onChange(arrayMove(items, from, to));
  };
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-fg-2">Subtasks</h3>
        {items.length > 0 && (
          <span className="text-[12px] text-fg-3 tabular-nums">
            {done}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((s) => s.key)} strategy={verticalListSortingStrategy}>
            <ul className="mb-1.5 flex flex-col">
              {items.map((s) => (
                <SubtaskItem
                  key={s.key}
                  item={s}
                  onChange={(patch) => onChange(items.map((x) => (x.key === s.key ? { ...x, ...patch } : x)))}
                  onRemove={() => onChange(items.filter((x) => x.key !== s.key))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-line px-2.5">
        <Plus className="h-4 w-4 text-fg-3" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder="Add a subtask and press Enter"
          aria-label="New subtask"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
        />
      </div>
    </section>
  );
}

function SubtaskItem({ item, onChange, onRemove }: { item: SubItem; onChange: (p: Partial<SubItem>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/sub flex h-9 items-center gap-2 rounded-lg px-1 hover:bg-surface-2", isDragging && "relative z-10 bg-surface shadow-pop")}
    >
      <button type="button" {...attributes} {...listeners} aria-label="Reorder subtask" className="cursor-grab touch-none rounded p-0.5 text-fg-3 opacity-60 hover:opacity-100 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox checked={item.done} onChange={(v) => onChange({ done: v })} size={16} color="var(--success)" label={item.done ? "Mark subtask not done" : "Mark subtask done"} />
      <input
        value={item.title}
        onChange={(e) => onChange({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) e.preventDefault();
        }}
        aria-label="Subtask title"
        maxLength={300}
        className={cn("h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none", item.done && "text-fg-3 line-through")}
      />
      <button type="button" onClick={onRemove} aria-label="Delete subtask" className="rounded p-1 text-fg-3 opacity-0 group-hover/sub:opacity-100 hover:bg-line hover:text-danger focus-visible:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 10 * 1024 * 1024;

async function uploadOne(taskId: string, file: File): Promise<WireAttachment> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("taskId", taskId);
  const res = await fetch("/api/attachments", { method: "POST", body: fd, headers: { "x-tz": browserTz() }, credentials: "same-origin" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`);
  return json.item;
}

async function uploadAll(taskId: string, files: File[]) {
  for (const f of files) {
    try {
      await uploadOne(taskId, f);
    } catch (err) {
      toastError(err);
    }
  }
}

function Attachments({ taskId, existing, queued, onQueue }: { taskId: string | null; existing: WireAttachment[]; queued: File[]; onQueue: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(existing);
  useEffect(() => setItems(existing), [existing]);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const ok: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_BYTES) toast.error(`${f.name} is larger than 10 MB`);
      else ok.push(f);
    }
    if (!ok.length) return;
    if (!taskId) return onQueue([...queued, ...ok]);
    setBusy(true);
    try {
      for (const f of ok) {
        const item = await uploadOne(taskId, f).catch((err) => {
          toastError(err);
          return null;
        });
        if (item) setItems((xs) => [...xs, item]);
      }
      refreshTasks();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (a: WireAttachment) => {
    if (!(await confirm({ title: "Delete attachment?", body: `“${a.fileName}” will be permanently deleted.`, destructive: true, confirmLabel: "Delete" }))) return;
    try {
      await api.delete(`/api/attachments/${a.id}`);
      setItems((xs) => xs.filter((x) => x.id !== a.id));
      refreshTasks();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-fg-2">Attachments</h3>
        <Button variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(e) => void pick(e.target.files)} />
      </div>
      {items.length === 0 && queued.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files);
          }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-line text-[12.5px] text-fg-3 hover:border-primary hover:text-primary"
        >
          <Paperclip className="h-4 w-4" /> Drop files or click to attach (max 10 MB)
        </button>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((a) => (
            <FileRow key={a.id} name={a.fileName} size={a.size}>
              <a href={`/api/attachments/${a.id}`} download={a.fileName} aria-label={`Download ${a.fileName}`} className="rounded p-1 text-fg-3 hover:bg-line hover:text-fg">
                <Download className="h-3.5 w-3.5" />
              </a>
              <button type="button" onClick={() => void remove(a)} aria-label={`Delete ${a.fileName}`} className="rounded p-1 text-fg-3 hover:bg-line hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </FileRow>
          ))}
          {queued.map((f, i) => (
            <FileRow key={`q${i}`} name={f.name} size={f.size} note="Uploads when saved">
              <button type="button" onClick={() => onQueue(queued.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="rounded p-1 text-fg-3 hover:bg-line hover:text-danger">
                <X className="h-3.5 w-3.5" />
              </button>
            </FileRow>
          ))}
        </ul>
      )}
    </section>
  );
}

function FileRow({ name, size, note, children }: { name: string; size: number; note?: string; children: ReactNode }) {
  return (
    <li className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5">
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{name}</span>
      <span className="shrink-0 text-[11.5px] text-fg-3">{note ?? fmtBytes(size)}</span>
      {children}
    </li>
  );
}
