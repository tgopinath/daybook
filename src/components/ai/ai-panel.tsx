"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Bell, Lightbulb, MessageSquare, RefreshCw, Sparkles, Target, TrendingDown, TrendingUp, X, Minus } from "lucide-react";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { toggleAIPanel } from "@/lib/ui-store";
import { useTz } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Badge, PRIORITY_META, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { cn } from "@/lib/utils";
import type { Insights, InsightTask } from "@/lib/ai/types";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/ai/types";
import { useAIStatus } from "./use-ai";
import { AINotConfigured } from "./not-configured";
import { ChatError, Composer, MessageList, useChat } from "./chat";

const QUICK_COMMANDS = ["Plan my day", "What should I focus on today?", "Summarize my week", "Remind me to drink water every two hours"];

function closeIfOverlay() {
  if (typeof window !== "undefined" && window.innerWidth < 1280) toggleAIPanel(false);
}

export function AIPanel() {
  const { configured, loading: statusLoading } = useAIStatus();
  const { data, error, isLoading, mutate } = useApi<Insights>("/api/ai/insights", { refreshInterval: 5 * 60_000 });
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <aside aria-label="AI assistant panel" className="flex h-full w-full flex-col border-l border-line bg-surface xl:w-[360px]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h2 className="flex-1 text-[15px] font-semibold">Assistant</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Refresh insights" title="Refresh" onClick={() => void mutate()}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
        <Link href="/assistant" onClick={closeIfOverlay} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg" aria-label="Open full assistant" title="Open full assistant">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        <Button size="icon-sm" variant="ghost" aria-label="Close assistant panel" onClick={() => toggleAIPanel(false)}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div className="flex flex-col gap-5 p-4 pb-6">
          {!statusLoading && !configured && <AINotConfigured compact />}

          <Suggestions configured={configured} />

          {error && !data ? (
            <p role="alert" className="rounded-xl bg-danger-soft/60 p-3 text-[13px] text-danger">
              Couldn&apos;t load insights: {error instanceof Error ? error.message : "unknown error"}.{" "}
              <button className="font-medium underline" onClick={() => void mutate()}>
                Retry
              </button>
            </p>
          ) : !data ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              <Priorities items={data.priorities} />
              {data.overdue.count > 0 && <Overdue data={data.overdue} />}
              <Reminders items={data.reminders} />
              <Productivity data={data} />
            </>
          )}

          <Section title="Quick commands" icon={MessageSquare}>
            <div className="flex flex-wrap gap-1.5" title={configured ? undefined : NOT_CONFIGURED_MESSAGE}>
              {QUICK_COMMANDS.map((p) => (
                <button
                  key={p}
                  disabled={!configured}
                  onClick={() => {
                    router.push(`/assistant?prompt=${encodeURIComponent(p)}`);
                    closeIfOverlay();
                  }}
                  className="rounded-full border border-line px-2.5 py-1 text-[12px] text-fg-2 transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </Section>

          {chatOpen && configured && <InlineChat />}
        </div>
      </div>

      <footer className="shrink-0 border-t border-line p-3">
        {chatOpen && configured ? (
          <p className="text-center text-[11.5px] text-fg-3">Replies appear above · changes always ask before saving</p>
        ) : (
          <Button variant="outline" className="w-full" disabled={!configured} title={configured ? undefined : NOT_CONFIGURED_MESSAGE} onClick={() => setChatOpen(true)}>
            <Sparkles className="h-4 w-4 text-primary" />
            {configured ? "Ask the assistant here" : "Chat unavailable — AI not configured"}
          </Button>
        )}
      </footer>
    </aside>
  );
}

function Section({ title, icon: Icon, children, action }: { title: string; icon: typeof Sparkles; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-fg-3" />
        <h3 className="flex-1 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------------- AI suggestions (LLM, on demand) ---------------- */

function Suggestions({ configured }: { configured: boolean }) {
  const [state, setState] = useState<{ loading: boolean; items: { title: string; detail: string }[] | null; error: string | null }>({ loading: false, items: null, error: null });
  const run = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.post<{ suggestions: { title: string; detail: string }[] }>("/api/ai/insights/suggest");
      setState({ loading: false, items: res.suggestions, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Something went wrong" }));
    }
  };
  return (
    <Section title="AI suggestions" icon={Lightbulb}>
      {state.items && (
        <ul className="flex flex-col gap-2">
          {state.items.map((s, i) => (
            <li key={i} className="rounded-xl border border-line bg-surface-2/50 p-2.5">
              <p className="text-[14px] font-medium">{s.title}</p>
              {s.detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{s.detail}</p>}
            </li>
          ))}
        </ul>
      )}
      {state.error && (
        <p role="alert" className="text-[12.5px] text-danger">
          {state.error}
        </p>
      )}
      <div title={configured ? undefined : NOT_CONFIGURED_MESSAGE}>
        <Button size="sm" variant={state.items ? "ghost" : "secondary"} className="w-full" onClick={run} loading={state.loading} disabled={!configured}>
          {!state.loading && <Sparkles className="h-3.5 w-3.5 text-primary" />}
          {state.items ? "Refresh suggestions" : "Get suggestions"}
        </Button>
        {!configured && <p className="mt-1.5 text-[11.5px] text-fg-3">Needs an AI key — the sections below work without it.</p>}
      </div>
    </Section>
  );
}

/* ---------------- Deterministic sections ---------------- */

function useDueLabel() {
  const tz = useTz();
  return (iso: string | null, overdue: boolean) => {
    if (!iso) return null;
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = overdue ? { timeZone: tz, month: "short", day: "numeric" } : { timeZone: tz, hour: "numeric", minute: "2-digit" };
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  };
}

function TaskRow({ t }: { t: InsightTask }) {
  const [done, setDone] = useState(false);
  const dueLabel = useDueLabel();
  const toggle = async () => {
    setDone(true);
    try {
      await api.patch(`/api/tasks/${t.id}`, { status: "COMPLETED" });
      toast.undo(`Completed “${t.title}”`, async () => {
        try {
          await api.patch(`/api/tasks/${t.id}`, { status: t.status });
          refresh("/api/tasks", "/api/ai/day", ...SUMMARY_KEYS);
        } catch (err) {
          toastError(err);
        }
      });
      refresh("/api/tasks", "/api/goals", "/api/ai/day", ...SUMMARY_KEYS);
    } catch (err) {
      setDone(false);
      toastError(err);
    }
  };
  const label = dueLabel(t.dueDate, t.overdue);
  return (
    <li className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
      <Checkbox checked={done} onChange={() => !done && void toggle()} label={`Complete ${t.title}`} color={PRIORITY_META[t.priority].color} />
      <button className={cn("min-w-0 flex-1 truncate text-left text-[14px]", done && "text-fg-3 line-through")} onClick={() => openTaskDialog({ id: t.id })}>
        {t.title}
      </button>
      {label && <span className={cn("shrink-0 text-[11.5px] tabular-nums", t.overdue ? "text-danger" : "text-fg-3")}>{label}</span>}
    </li>
  );
}

function Priorities({ items }: { items: InsightTask[] }) {
  return (
    <Section title="Today's priorities" icon={Target}>
      {items.length ? (
        <ul className="-mx-1.5 flex flex-col">
          {items.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-line p-3 text-center text-[12.5px] text-fg-3">
          Nothing due today.{" "}
          <button className="font-medium text-primary hover:underline" onClick={() => openTaskDialog()}>
            Add a task
          </button>
        </div>
      )}
    </Section>
  );
}

function Overdue({ data }: { data: Insights["overdue"] }) {
  return (
    <Section
      title="Overdue"
      icon={AlertTriangle}
      action={
        <Link href="/tasks?view=overdue" onClick={closeIfOverlay} className="text-[12px] text-primary hover:underline">
          View all
        </Link>
      }
    >
      <div className="rounded-xl border border-danger/20 bg-danger-soft/40 p-1.5">
        <p className="px-1.5 pt-0.5 pb-1 text-[12px] font-medium text-danger">
          {data.count} task{data.count === 1 ? "" : "s"} past due
        </p>
        <ul className="flex flex-col">
          {data.items.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Reminders({ items }: { items: Insights["reminders"] }) {
  const tz = useTz();
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", ...(sameDay ? {} : { weekday: "short" }) }).format(d);
  };
  return (
    <Section
      title="Next 24 hours"
      icon={Bell}
      action={
        <Link href="/reminders" onClick={closeIfOverlay} className="text-[12px] text-primary hover:underline">
          Reminders
        </Link>
      }
    >
      {items.length ? (
        <ul className="flex flex-col gap-1">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 px-1.5 py-1 text-[14px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-[11.5px] text-fg-3 tabular-nums">{fmt(r.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1.5 text-[12.5px] text-fg-3">No reminders in the next 24 hours.</p>
      )}
    </Section>
  );
}

function Productivity({ data }: { data: Insights }) {
  const s = data.stats;
  const diff = s.completedThisWeek - s.completedLastWeek;
  const Trend = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <Section title="Productivity" icon={TrendingUp}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Done this week" value={String(s.completedThisWeek)} extra={<Trend className={cn("h-3.5 w-3.5", diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-fg-3")} />} />
        <Stat label="Week complete" value={`${s.completionRate}%`} />
        <Stat label="Habits" value={s.habitRate === null ? "—" : `${s.habitRate}%`} />
      </div>
      <ul className="flex flex-col gap-1.5">
        {data.lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-fg-2">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", l.tone === "positive" ? "bg-success" : l.tone === "warning" ? "bg-warning" : "bg-fg-3")} />
            {l.text}
          </li>
        ))}
      </ul>
      {s.activeGoals > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-fg-3">
          <Badge tone="primary">{s.activeGoals} active goals</Badge>
          {s.avgGoalProgress !== null && <span>avg {s.avgGoalProgress}% complete</span>}
        </div>
      )}
    </Section>
  );
}

function Stat({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line px-2.5 py-2">
      <div className="flex items-center gap-1">
        <span className="text-[17px] font-semibold tabular-nums">{value}</span>
        {extra}
      </div>
      <p className="text-[11px] leading-tight text-fg-3">{label}</p>
    </div>
  );
}

/* ---------------- Inline chat ---------------- */

function InlineChat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chat = useChat(conversationId, { onCreated: (id) => setConversationId(id) });
  return (
    <Section
      title="Chat"
      icon={Sparkles}
      action={
        conversationId ? (
          <Link href={`/assistant?c=${conversationId}`} onClick={closeIfOverlay} className="text-[12px] text-primary hover:underline">
            Continue in full view
          </Link>
        ) : null
      }
    >
      {chat.messages.length > 0 && <MessageList messages={chat.messages} sending={chat.sending} onDecide={chat.decide} compact />}
      {chat.sending && !chat.messages.length && <p className="text-[12px] text-fg-3">Thinking…</p>}
      {chat.error && <ChatError error={chat.error} onRetry={() => void chat.send(chat.error!.text)} onDismiss={chat.clearError} />}
      <Composer compact autoFocus onSend={chat.send} sending={chat.sending} placeholder="Ask or tell me to add something…" />
    </Section>
  );
}
