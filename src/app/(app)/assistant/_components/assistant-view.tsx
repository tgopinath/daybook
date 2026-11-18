"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, MoreHorizontal, PanelLeft, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api, refresh, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { useAIStatus } from "@/components/ai/use-ai";
import { AINotConfigured } from "@/components/ai/not-configured";
import { ChatError, Composer, MessageList, PromptChips, useChat } from "@/components/ai/chat";
import { NOT_CONFIGURED_MESSAGE, type WireConversation } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

export function AssistantView() {
  const params = useSearchParams();
  const router = useRouter();
  const { configured, status, loading: statusLoading } = useAIStatus();
  const [conversationId, setConversationId] = useState<string | null>(params.get("c"));
  const [drawer, setDrawer] = useState(false);
  const [renaming, setRenaming] = useState<WireConversation | null>(null);
  const list = useApi<{ items: WireConversation[] }>("/api/ai/conversations");
  const chat = useChat(conversationId, { onCreated: (id) => setConversationId(id) });
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // ?prompt=… (from the AI panel's quick commands) starts a new conversation and sends it once.
  useEffect(() => {
    const prompt = params.get("prompt");
    const c = params.get("c");
    if (c && c !== conversationId) setConversationId(c);
    if (!prompt || autoSent.current || statusLoading) return;
    autoSent.current = true;
    router.replace("/assistant");
    if (!configured) return;
    setConversationId(null);
    setPendingPrompt(prompt);
  }, [params, statusLoading, configured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send the queued prompt once the new (empty) conversation is active.
  useEffect(() => {
    if (!pendingPrompt || conversationId !== null || chat.sending) return;
    const p = pendingPrompt;
    setPendingPrompt(null);
    void chat.send(p);
  }, [pendingPrompt, conversationId, chat.sending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages.length, chat.sending]);

  const items = list.data?.items ?? [];
  const current = items.find((c) => c.id === conversationId);

  const select = (id: string | null) => {
    setConversationId(id);
    setDrawer(false);
  };

  const remove = async (c: WireConversation) => {
    const ok = await confirm({ title: "Delete conversation?", body: `“${c.title}” and its messages will be permanently deleted. Records you created from it stay.`, destructive: true, confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await api.delete(`/api/ai/conversations/${c.id}`);
      if (conversationId === c.id) setConversationId(null);
      refresh("/api/ai/conversations");
      toast.success("Conversation deleted");
    } catch (err) {
      toastError(err);
    }
  };

  const sidebar = (
    <ConversationList
      items={items}
      loading={list.isLoading && !list.data}
      error={list.error}
      activeId={conversationId}
      onSelect={select}
      onRename={setRenaming}
      onDelete={remove}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-[420px] gap-5 md:h-[calc(100dvh-8rem)]">
      <aside className="hidden w-[260px] shrink-0 flex-col lg:flex">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Conversations">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[84%] max-w-[320px] flex-col bg-surface p-3 shadow-modal">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[15px] font-semibold">Conversations</span>
              <Button size="icon-sm" variant="ghost" onClick={() => setDrawer(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="mb-3 flex items-center gap-2">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Show conversations">
            <PanelLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold tracking-tight">{current?.title ?? "Assistant"}</h1>
            <p className="text-[12px] text-fg-3">
              {status ? (configured ? `${status.provider === "anthropic" ? "Anthropic" : "OpenAI"} · ${status.model} · changes always ask first` : "Not configured") : " "}
            </p>
          </div>
          {current && (
            <Menu
              trigger={
                <Button size="icon" variant="ghost" aria-label="Conversation options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                { label: "Rename", icon: Pencil, onSelect: () => setRenaming(current) },
                { label: "Delete", icon: Trash2, danger: true, onSelect: () => void remove(current) },
              ]}
            />
          )}
          <Button variant="outline" size="sm" onClick={() => select(null)} disabled={!conversationId && !chat.messages.length}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[14px] border border-line bg-surface p-4 scroll-thin md:p-6">
          {!statusLoading && !configured && <AINotConfigured className="mb-5" />}
          {chat.loading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="ml-auto h-9 w-1/2" />
              <Skeleton className="h-20 w-3/4" />
            </div>
          ) : chat.loadError && !chat.messages.length ? (
            <p role="alert" className="text-[13px] text-danger">
              Couldn&apos;t load this conversation: {chat.loadError instanceof Error ? chat.loadError.message : "unknown error"}
            </p>
          ) : chat.messages.length || chat.sending ? (
            <MessageList messages={chat.messages} sending={chat.sending} onDecide={chat.decide} />
          ) : (
            <EmptyChat configured={configured} onPick={(p) => void chat.send(p)} />
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {chat.error && <ChatError error={chat.error} onRetry={() => void chat.send(chat.error!.text)} onDismiss={chat.clearError} />}
          {chat.messages.length > 0 && configured && <PromptChips onPick={(p) => void chat.send(p)} disabled={chat.sending} className="hidden md:flex" prompts={["What should I focus on today?", "Plan my day", "Summarize my week"]} />}
          <Composer onSend={chat.send} sending={chat.sending} disabled={!configured} disabledReason={NOT_CONFIGURED_MESSAGE} autoFocus />
        </div>
      </section>

      <RenameDialog conversation={renaming} onClose={() => setRenaming(null)} />
    </div>
  );
}

function EmptyChat({ configured, onPick }: { configured: boolean; onPick: (p: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="text-[17px] font-semibold">How can I help today?</h2>
      <p className="mt-1 max-w-md text-sm text-fg-2">I can read your tasks, goals, calendar and reminders, plan your day, and propose changes — nothing is saved until you confirm.</p>
      <div title={configured ? undefined : NOT_CONFIGURED_MESSAGE}>
        <PromptChips onPick={onPick} disabled={!configured} className="mt-6 max-w-xl justify-center" />
      </div>
    </div>
  );
}

function ConversationList({
  items,
  loading,
  error,
  activeId,
  onSelect,
  onRename,
  onDelete,
}: {
  items: WireConversation[];
  loading: boolean;
  error: unknown;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (c: WireConversation) => void;
  onDelete: (c: WireConversation) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Button variant="secondary" className="w-full justify-center" onClick={() => onSelect(null)}>
        <Plus className="h-4 w-4" /> New conversation
      </Button>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {loading ? (
          <div className="flex flex-col gap-2 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="p-2 text-[12.5px] text-danger">
            Couldn&apos;t load conversations.
          </p>
        ) : !items.length ? (
          <div className="flex flex-col items-center px-3 py-10 text-center text-[12.5px] text-fg-3">
            <MessageSquare className="mb-2 h-5 w-5" />
            No conversations yet. Ask something to start one.
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 pt-1">
            {items.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => onSelect(c.id)}
                  className={cn("flex w-full flex-col rounded-[10px] px-2.5 py-2 pr-9 text-left transition-colors", c.id === activeId ? "bg-primary-soft" : "hover:bg-surface-2")}
                >
                  <span className={cn("truncate text-[13px] font-medium", c.id === activeId && "text-primary")}>{c.title}</span>
                  <span className="truncate text-[11.5px] text-fg-3">{relative(c.updatedAt)}</span>
                </button>
                <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                  <Menu
                    trigger={
                      <button className="rounded-md p-1 text-fg-3 hover:bg-surface hover:text-fg" aria-label={`Options for ${c.title}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                    items={[
                      { label: "Rename", icon: Pencil, onSelect: () => onRename(c) },
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => onDelete(c) },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RenameDialog({ conversation, onClose }: { conversation: WireConversation | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setTitle(conversation?.title ?? ""), [conversation]);
  const save = async () => {
    if (!conversation || !title.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/api/ai/conversations/${conversation.id}`, { title: title.trim() });
      refresh("/api/ai/conversations");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={!!conversation}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Rename conversation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!title.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Conversation title" />
      </form>
    </Dialog>
  );
}
