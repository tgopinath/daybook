"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as D from "@radix-ui/react-dialog";
import { Bell, CalendarDays, CheckSquare, CornerDownLeft, FileText, Repeat, Sparkles, Wand2, Zap } from "lucide-react";
import { ui } from "@/lib/ui-store";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { useTz } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { describeCaptureRecurrence, isUnambiguous, parseCapture, type CaptureIntent, type CaptureParse, type CaptureRecurrenceKind } from "@/lib/ai/parse";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/ai/types";
import { useAIStatus } from "@/components/ai/use-ai";
import { cn } from "@/lib/utils";

const EXAMPLES = ["Call John tomorrow at 10 AM", "Complete portfolio by December 10", "Read 20 pages every day", "Pay electricity bill on Friday", "Buy groceries this evening"];

const INTENTS: { value: CaptureIntent; label: string; icon: typeof CheckSquare }[] = [
  { value: "task", label: "Task", icon: CheckSquare },
  { value: "reminder", label: "Reminder", icon: Bell },
  { value: "event", label: "Event", icon: CalendarDays },
  { value: "habit", label: "Habit", icon: Repeat },
  { value: "note", label: "Note", icon: FileText },
];

type SaveResult = { kind: CaptureIntent; id: string; title: string; href: string };

export function QuickCapture() {
  const { quickCaptureOpen, quickCaptureText } = ui.use();
  const close = () => ui.set({ quickCaptureOpen: false, quickCaptureText: "" });
  return (
    <D.Root open={quickCaptureOpen} onOpenChange={(o) => !o && close()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_.15s_ease-out]" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-0 z-50 mx-auto flex max-h-[100dvh] w-full flex-col overflow-hidden border border-line bg-surface shadow-modal outline-none sm:top-[12vh] sm:max-h-[76vh] sm:max-w-[620px] sm:rounded-2xl data-[state=open]:animate-[dialogIn_.18s_cubic-bezier(.2,.8,.2,1)]"
        >
          <D.Title className="sr-only">Quick capture</D.Title>
          {quickCaptureOpen && <CaptureBody initial={quickCaptureText} onDone={close} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function CaptureBody({ initial, onDone }: { initial: string; onDone: () => void }) {
  const tz = useTz();
  const { configured } = useAIStatus();
  const [text, setText] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [form, setForm] = useState<CaptureParse | null>(null);
  const [touched, setTouched] = useState(false); // user edited the preview
  const [aiFor, setAiFor] = useState<string | null>(null); // text the current AI parse belongs to
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(text), 400);
    return () => clearTimeout(h);
  }, [text]);

  useEffect(() => {
    if (text) return;
    const h = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(h);
  }, [text]);

  const basic = useMemo(() => (debounced.trim() ? parseCapture(debounced, new Date(), tz) : null), [debounced, tz]);

  // Live basic parsing drives the preview until the user edits it or AI improves it.
  useEffect(() => {
    if (touched || (aiFor && aiFor === debounced)) return;
    setForm(basic);
    setAiError(null);
  }, [basic]); // eslint-disable-line react-hooks/exhaustive-deps

  const stale = text !== debounced;
  const current = form;

  const patch = (p: Partial<CaptureParse>) => {
    setTouched(true);
    setForm((f) => (f ? { ...f, ...p } : f));
  };

  const improveWithAI = async (): Promise<CaptureParse | null> => {
    if (!configured || !text.trim()) return null;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await api.post<{ parse: CaptureParse; notice?: string }>("/api/ai/capture", { text, useAI: true });
      setForm(res.parse);
      setDebounced(text);
      setAiFor(text);
      setTouched(false);
      if (res.notice) setAiError(res.notice);
      return res.parse;
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI parsing failed");
      return null;
    } finally {
      setAiLoading(false);
    }
  };

  const save = async (p: CaptureParse) => {
    if (!p.title.trim()) {
      toast.error("Add a title first");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<SaveResult>("/api/ai/capture/save", {
        intent: p.intent,
        title: p.title,
        date: p.date,
        time: p.time,
        endTime: p.endTime,
        priority: p.priority,
        recurrence: p.recurrence,
        category: p.category,
      });
      refresh(...SUMMARY_KEYS, "/api/tasks", "/api/reminders", "/api/events", "/api/habits", "/api/notes", "/api/ai/day");
      const label = INTENTS.find((i) => i.value === res.kind)?.label ?? "Item";
      const undo = async () => {
        try {
          await api.post("/api/ai/capture/undo", { kind: res.kind, id: res.id });
          refresh(...SUMMARY_KEYS, "/api/tasks", "/api/reminders", "/api/events", "/api/habits", "/api/notes", "/api/ai/day");
          toast.info(`${label} removed`);
        } catch (err) {
          toastError(err);
        }
      };
      toast.undo(`${label} added: ${res.title}`, undo);
      onDone();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const onEnter = async () => {
    if (!text.trim() || saving || aiLoading) return;
    // Make sure the preview reflects what's typed right now.
    let p = current && !stale ? current : parseCapture(text, new Date(), tz);
    if (stale && !touched) {
      setDebounced(text);
      setForm(p);
    }
    // With AI available, Enter first asks AI (unless already parsed by AI or edited by hand).
    if (configured && !touched && aiFor !== text) {
      const ai = await improveWithAI();
      if (!ai) return; // error shown; user can still press Save
      p = ai;
    }
    if (isUnambiguous(p)) await save(p);
    // Otherwise the preview stays open and the user confirms with "Save".
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        if (current) void save(current);
      } else void onEnter();
    }
  };

  const needsConfirm = current ? !isUnambiguous(current) : false;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Zap className="h-4.5 w-4.5 shrink-0 text-primary" />
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTouched(false);
            setAiFor(null);
          }}
          onKeyDown={onKey}
          placeholder={`Try “${EXAMPLES[exampleIdx]}”`}
          aria-label="Capture a task, reminder, event, habit or note"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
        />
        <Kbd>esc</Kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {!current ? (
          <div className="px-4 py-4">
            <p className="mb-2 text-[12px] font-medium tracking-wide text-fg-3 uppercase">Examples</p>
            <div className="flex flex-col">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setText(ex);
                    setDebounced(ex);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] text-fg-2 hover:bg-surface-2 hover:text-fg"
                >
                  <CornerDownLeft className="h-3.5 w-3.5 text-fg-3" />
                  {ex}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-fg-3">Dates, times, priorities (“urgent”) and repeats (“every Monday”, “every 2 hours”) are detected as you type.</p>
          </div>
        ) : (
          <Preview form={current} patch={patch} aiFor={aiFor === text} stale={stale && !touched} matched={current.matched} />
        )}
        {aiError && (
          <p role="alert" className="mx-4 mb-3 rounded-lg bg-danger-soft/60 px-3 py-2 text-[12.5px] text-danger">
            {aiError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div title={configured ? undefined : NOT_CONFIGURED_MESSAGE}>
          <Button size="sm" variant="outline" disabled={!configured || !text.trim() || aiLoading} loading={aiLoading} onClick={() => void improveWithAI()}>
            {!aiLoading && <Wand2 className="h-3.5 w-3.5 text-primary" />}
            Improve with AI
          </Button>
        </div>
        {!configured && <span className="text-[11.5px] text-fg-3">AI not configured — using basic parsing</span>}
        <div className="ml-auto flex items-center gap-2">
          {current && (
            <span className="hidden text-[11.5px] text-fg-3 sm:inline">
              {needsConfirm ? "Review, then Save" : <>Enter saves · <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd> force save</>}
            </span>
          )}
          <Button size="sm" disabled={!current || !current.title.trim()} loading={saving} onClick={() => current && void save(current)}>
            Save {current ? INTENTS.find((i) => i.value === current.intent)?.label.toLowerCase() : ""}
          </Button>
        </div>
      </div>
    </>
  );
}

function Preview({ form, patch, aiFor, stale, matched }: { form: CaptureParse; patch: (p: Partial<CaptureParse>) => void; aiFor: boolean; stale: boolean; matched: string[] }) {
  const showDate = form.intent !== "habit" && form.intent !== "note";
  const showTime = form.intent !== "note";
  const showRecurrence = form.intent === "reminder" || form.intent === "habit" || form.intent === "task" || form.intent === "event";
  const recurrenceOptions: CaptureRecurrenceKind[] = form.intent === "reminder" ? ["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] : form.intent === "habit" ? ["DAILY", "WEEKLY"] : ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-4 transition-opacity", stale && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium", form.source === "ai" && aiFor ? "bg-primary-soft text-primary" : "bg-surface-2 text-fg-2")}>
          {form.source === "ai" && aiFor ? (
            <>
              <Sparkles className="h-3 w-3" /> Parsed by AI
            </>
          ) : (
            "Basic parsing"
          )}
        </span>
        {form.confidence !== "high" && <span className="text-[11.5px] text-fg-3">{form.confidence === "medium" ? "Check the details below" : "Couldn't find a clear title"}</span>}
        {matched.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {matched.slice(0, 4).map((m, i) => (
              <span key={i} className="rounded bg-warning-soft px-1 text-[11px] text-warning-text">
                {m}
              </span>
            ))}
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1.5">
        {INTENTS.map((i) => {
          const active = i.value === form.intent;
          return (
            <button
              key={i.value}
              role="radio"
              aria-checked={active}
              onClick={() =>
                patch({
                  intent: i.value,
                  ...(i.value === "habit" && !["DAILY", "WEEKLY"].includes(form.recurrence.kind) ? { recurrence: { kind: "DAILY" } } : {}),
                  ...(i.value !== "reminder" && form.recurrence.kind === "HOURLY" ? { recurrence: { kind: i.value === "habit" ? "DAILY" : "NONE" } } : {}),
                })
              }
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
                active ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-2 hover:bg-surface-2",
              )}
            >
              <i.icon className="h-3.5 w-3.5" />
              {i.label}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-fg-3">Title</span>
        <Input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="What is it?" />
      </label>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {showDate && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-3">Date</span>
            <Input type="date" value={form.date ?? ""} onChange={(e) => patch({ date: e.target.value || null })} />
          </label>
        )}
        {showTime && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-3">{form.intent === "habit" ? "Reminder time" : "Time"}</span>
            <Input type="time" value={form.time ?? ""} onChange={(e) => patch({ time: e.target.value || null })} />
          </label>
        )}
        {form.intent === "task" && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-3">Priority</span>
            <Select value={form.priority ?? ""} onChange={(e) => patch({ priority: (e.target.value || null) as CaptureParse["priority"] })}>
              <option value="">Default</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
          </label>
        )}
        {showRecurrence && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-3">Repeat</span>
            <Select
              value={form.recurrence.kind}
              onChange={(e) => {
                const kind = e.target.value as CaptureRecurrenceKind;
                patch({ recurrence: { kind, intervalMinutes: kind === "HOURLY" ? (form.recurrence.intervalMinutes ?? 60) : null, daysOfWeek: kind === "WEEKLY" ? form.recurrence.daysOfWeek : null } });
              }}
            >
              {recurrenceOptions.map((k) => (
                <option key={k} value={k}>
                  {k === form.recurrence.kind ? describeCaptureRecurrence(form.recurrence) : describeCaptureRecurrence({ kind: k, intervalMinutes: k === "HOURLY" ? 60 : null })}
                </option>
              ))}
            </Select>
          </label>
        )}
        {form.recurrence.kind === "HOURLY" && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-3">Every (minutes)</span>
            <Input
              type="number"
              min={5}
              step={5}
              value={form.recurrence.intervalMinutes ?? 60}
              onChange={(e) => patch({ recurrence: { ...form.recurrence, intervalMinutes: Math.max(5, Number(e.target.value) || 60) } })}
            />
          </label>
        )}
        {form.intent !== "habit" && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-3">Category</span>
            <Input value={form.category ?? ""} onChange={(e) => patch({ category: e.target.value || null })} placeholder="None" />
          </label>
        )}
      </div>
    </div>
  );
}
