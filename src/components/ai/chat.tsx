"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertCircle, ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolCallRecord, WireAIMessage } from "@/lib/ai/types";
import { Markdown } from "./markdown";
import { ToolActivity, ToolCallCard } from "./tool-call-card";

export const SUGGESTED_PROMPTS = [
  "Plan my day",
  "What should I focus on today?",
  "Summarize my week",
  "Break my fitness goal into weekly tasks",
  "Remind me to drink water every two hours",
];

type ChatResponse = { conversationId: string; conversation: { id: string; title: string }; userMessage: WireAIMessage; message: WireAIMessage };
type ActionResponse = { message: WireAIMessage; followUp: WireAIMessage; toolCall: ToolCallRecord };

const REFRESH_FOR: Record<string, string[]> = {
  create_task: ["/api/tasks", "/api/goals", "/api/ai/day"],
  update_task: ["/api/tasks", "/api/ai/day"],
  complete_task: ["/api/tasks", "/api/goals", "/api/ai/day"],
  create_tasks_for_goal: ["/api/tasks", "/api/goals"],
  create_reminder: ["/api/reminders"],
  create_event: ["/api/events", "/api/ai/day"],
  create_note: ["/api/notes"],
};

/**
 * Conversation state: loads persisted messages, sends new ones, and applies
 * decisions on proposed write actions.
 */
export function useChat(conversationId: string | null, opts: { onCreated?: (id: string, title: string) => void } = {}) {
  const { data, isLoading, error: loadError } = useApi<{ messages: WireAIMessage[] }>(conversationId ? `/api/ai/conversations/${conversationId}` : null, {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });
  const [messages, setMessages] = useState<WireAIMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; text: string } | null>(null);
  const localId = useRef<string | null>(null);
  const onCreated = useRef(opts.onCreated);
  onCreated.current = opts.onCreated;

  // Switching conversations: reset, unless it's the one we just created locally.
  useEffect(() => {
    if (conversationId && localId.current === conversationId) {
      localId.current = null;
      return;
    }
    if (!sending) setMessages([]);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Adopt persisted messages once loaded (a refetch after a send has the same rows).
  useEffect(() => {
    if (data && conversationId && !sending) setMessages(data.messages);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setError(null), [conversationId]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return false;
      setError(null);
      setSending(true);
      const temp: WireAIMessage = { id: `temp-${Date.now()}`, role: "USER", content: text, toolCalls: null, createdAt: new Date().toISOString() };
      setMessages((m) => [...m, temp]);
      try {
        const res = await api.post<ChatResponse>("/api/ai/chat", { conversationId, message: text });
        setMessages((m) => [...m.filter((x) => x.id !== temp.id), res.userMessage, res.message]);
        if (!conversationId) {
          localId.current = res.conversationId;
          onCreated.current?.(res.conversationId, res.conversation.title);
        }
        refresh("/api/ai/conversations");
        return true;
      } catch (err) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setError({ message: err instanceof Error ? err.message : "Something went wrong", text });
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversationId, sending],
  );

  const decide = useCallback(async (messageId: string, call: ToolCallRecord, decision: "confirm" | "reject", input?: Record<string, unknown>) => {
    const res = await api.post<ActionResponse>("/api/ai/actions", { messageId, toolCallId: call.id, decision, input });
    setMessages((m) => [...m.map((x) => (x.id === res.message.id ? res.message : x)), res.followUp]);
    if (decision === "confirm") refresh(...(REFRESH_FOR[call.name] ?? []), ...SUMMARY_KEYS);
  }, []);

  return { messages, sending, error, clearError: () => setError(null), send, decide, loading: !!conversationId && isLoading && !messages.length, loadError };
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-fg-3" aria-live="polite" aria-label="Assistant is thinking">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-3" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
    </div>
  );
}

export function MessageList({
  messages,
  sending,
  onDecide,
  compact,
}: {
  messages: WireAIMessage[];
  sending: boolean;
  onDecide: (messageId: string, call: ToolCallRecord, decision: "confirm" | "reject", input?: Record<string, unknown>) => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-5")}>
      {messages.map((m) => {
        if (m.role === "USER")
          return (
            <div key={m.id} className="flex justify-end">
              <div className={cn("max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-on-primary whitespace-pre-wrap", compact ? "text-[14px]" : "text-[14px]")}>{m.content}</div>
            </div>
          );
        if (m.role === "TOOL")
          return (
            <p key={m.id} className="text-center text-[12px] text-fg-3">
              {m.content}
            </p>
          );
        const calls = m.toolCalls ?? [];
        const writes = calls.filter((c) => !c.readOnly);
        return (
          <div key={m.id} className="flex gap-2.5">
            {!compact && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <ToolActivity calls={calls} />
              {m.content && <Markdown text={m.content} className={compact ? "text-[14px]" : undefined} />}
              {writes.map((c) => (
                <ToolCallCard key={c.id} call={c} compact={compact} onDecide={(decision, input) => onDecide(m.id, c, decision, input)} />
              ))}
            </div>
          </div>
        );
      })}
      {sending && <TypingIndicator />}
    </div>
  );
}

export function ChatError({ error, onRetry, onDismiss }: { error: { message: string }; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/60 px-3 py-2.5 text-[13px] text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{error.message}</span>
      <button onClick={onRetry} className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline">
        <RotateCcw className="h-3.5 w-3.5" /> Retry
      </button>
      <button onClick={onDismiss} className="shrink-0 text-danger/70 hover:text-danger" aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

export function Composer({
  onSend,
  disabled,
  disabledReason,
  sending,
  placeholder = "Ask anything about your day…",
  compact,
  autoFocus,
}: {
  onSend: (text: string) => Promise<boolean> | boolean;
  disabled?: boolean;
  disabledReason?: string;
  sending?: boolean;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);
  const submit = async () => {
    if (!text.trim() || disabled || sending) return;
    const value = text;
    setText("");
    const ok = await onSend(value);
    if (!ok) setText((t) => t || value);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };
  return (
    <div title={disabled ? disabledReason : undefined}>
      <div className={cn("flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-3 shadow-card transition-colors focus-within:border-primary", disabled && "opacity-60")}>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={disabled ? (disabledReason ?? placeholder) : placeholder}
          aria-label="Message the assistant"
          className={cn("max-h-40 min-h-[34px] flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-fg-3 disabled:cursor-not-allowed", compact ? "text-[14px]" : "text-sm")}
        />
        <Button size="icon" onClick={() => void submit()} disabled={disabled || !text.trim()} loading={sending} aria-label="Send">
          {!sending && <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function PromptChips({ onPick, disabled, className, prompts = SUGGESTED_PROMPTS }: { onPick: (p: string) => void; disabled?: boolean; className?: string; prompts?: string[] }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {prompts.map((p) => (
        <button
          key={p}
          disabled={disabled}
          onClick={() => onPick(p)}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-fg-2 transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:pointer-events-none disabled:opacity-50"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
