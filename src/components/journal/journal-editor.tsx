"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { format } from "date-fns";
import {
  ArrowLeft, Archive, ArchiveRestore, Bold, Check, CloudOff, Heading1, Heading2, Italic, List, ListChecks, ListOrdered,
  Loader2, Lock, LockOpen, MoreHorizontal, Pin, Quote, Redo2, RotateCcw, Strikethrough, Trash2, Undo2, X,
} from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS } from "@/lib/client";
import { countWords, isEmptyEntry, readingMinutes } from "@/lib/journal";
import { MOODS } from "@/lib/moods";
import { ACCEPT, type Media } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Badge, DemoBadge, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { MediaGrid, MediaUploader } from "@/components/media/media";
import { cn } from "@/lib/utils";
import type { JournalFull } from "./types";

type Patch = Partial<{
  title: string;
  content: Record<string, unknown>;
  entryDate: string;
  mood: string | null;
  isPrivate: boolean;
  isDraft: boolean;
  pinned: boolean;
  tags: string[];
  mediaIds: string[];
}>;
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export const JOURNAL_KEYS = ["/api/journal", "/api/mood", ...SUMMARY_KEYS];

// Leave handling is deferred a tick so React's dev double-mount doesn't discard a fresh draft.
const pendingLeave = new Map<string, ReturnType<typeof setTimeout>>();

export function JournalEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useApi<{ item: JournalFull }>(`/api/journal/${id}`, { revalidateOnFocus: false });
  const entry = data?.item.id === id ? data.item : null;
  if (error && !entry)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-fg-2">{error.message === "Journal entry not found" ? "This entry doesn't exist anymore." : error.message}</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Back to journal
        </Button>
      </div>
    );
  if (!entry)
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="Loading entry">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  return <EditorInner key={entry.id} entry={entry} onClose={onClose} />;
}

function EditorInner({ entry, onClose }: { entry: JournalFull; onClose: () => void }) {
  const url = `/api/journal/${entry.id}`;
  const [title, setTitle] = useState(entry.title);
  const [entryDate, setEntryDate] = useState(entry.entryDate);
  const [mood, setMood] = useState<string | null>(entry.mood);
  const [isPrivate, setPrivate] = useState(entry.isPrivate);
  const [pinned, setPinned] = useState(entry.pinned);
  const [isDraft, setDraft] = useState(entry.isDraft);
  const [tags, setTags] = useState(entry.tags.map((t) => t.name));
  const [media, setMedia] = useState<Media[]>(entry.media);
  const [words, setWords] = useState(entry.wordCount);
  const [state, setState] = useState<SaveState>("idle");
  const [updatedAt, setUpdatedAt] = useState(new Date(entry.updatedAt));
  const { data: allTags } = useApi<{ items: { id: string; name: string }[] }>("/api/tags");

  // Latest values for leave handling (which runs after unmount).
  const snap = useRef({ title: entry.title, plainText: entry.plainText, mediaCount: entry.media.length, mood: entry.mood, tagCount: entry.tags.length, isDraft: entry.isDraft });
  snap.current = { ...snap.current, title, mediaCount: media.length, mood, tagCount: tags.length, isDraft };
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const left = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const flush = useCallback(
    (extra: Patch = {}) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const payload = { ...pending.current, ...extra };
      pending.current = {};
      if (!Object.keys(payload).length) return chain.current;
      setState("saving");
      const run = chain.current.then(async () => {
        try {
          await api.patch(url, payload);
          setState("saved");
          setUpdatedAt(new Date());
          if (payload.isDraft === false) setDraft(false);
          refresh(...JOURNAL_KEYS);
        } catch (err) {
          pending.current = { ...payload, ...pending.current };
          setState("error");
          toastError(err);
          throw err;
        }
      });
      chain.current = run.catch(() => {});
      return run;
    },
    [url],
  );

  const queue = useCallback(
    (patch: Patch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush().catch(() => {});
      else timer.current = setTimeout(() => void flush().catch(() => {}), 800);
    },
    [flush],
  );

  /** Finish with the entry: discard an empty draft, otherwise save it (no longer a draft). */
  const leave = useCallback(async (): Promise<"discarded" | "saved"> => {
    left.current = true;
    const s = snap.current;
    if (s.isDraft && isEmptyEntry(s)) {
      if (timer.current) clearTimeout(timer.current);
      pending.current = {};
      await chain.current;
      await api.delete(`${url}?permanent=1`).catch(() => {});
      refresh(...JOURNAL_KEYS);
      return "discarded";
    }
    await flush(s.isDraft ? { isDraft: false } : {});
    return "saved";
  }, [flush, url]);

  useEffect(() => {
    const t = pendingLeave.get(entry.id);
    if (t) clearTimeout(t);
    pendingLeave.delete(entry.id);
    const onHide = () => {
      // Page is going away: send what's left with keepalive so it isn't lost.
      const s = snap.current;
      if (s.isDraft && isEmptyEntry(s)) return;
      const payload = { ...pending.current, ...(s.isDraft ? { isDraft: false } : {}) };
      if (!Object.keys(payload).length) return;
      pending.current = {};
      void fetch(url, { method: "PATCH", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (left.current) return;
      pendingLeave.set(
        entry.id,
        setTimeout(() => {
          pendingLeave.delete(entry.id);
          void leave().catch(() => {});
        }, 60),
      );
    };
  }, [entry.id, url, leave]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] }, codeBlock: false, code: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "What's on your mind today?" }),
    ],
    content: entry.content && Object.keys(entry.content).length ? entry.content : undefined,
    immediatelyRender: false,
    editorProps: { attributes: { class: "prose-editor min-h-[40vh] pb-10 text-fg text-[16px]! leading-[1.8]!", "aria-label": "Journal entry" } },
    onUpdate: ({ editor }) => {
      const text = editor.getText({ blockSeparator: "\n" });
      snap.current.plainText = text;
      setWords(countWords(text));
      queue({ content: editor.getJSON() as Record<string, unknown> });
    },
  });

  useEffect(() => {
    if (!entry.title && !entry.plainText) titleRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = async () => {
    try {
      const r = await leave();
      if (r === "saved") toast.success("Entry saved");
      else toast.info("Empty draft discarded");
      onClose();
    } catch {
      left.current = false;
    }
  };

  const back = () => {
    // Unmount triggers the deferred leave (discard empty draft / save).
    onClose();
  };

  const archive = async (archived: boolean) => {
    try {
      left.current = true;
      await flush(snap.current.isDraft ? { isDraft: false } : {});
      await api.patch(url, { archived });
      refresh(...JOURNAL_KEYS);
      if (archived) {
        onClose();
        toast.undo("Entry archived", async () => {
          await api.patch(url, { archived: false }).catch(toastError);
          refresh(...JOURNAL_KEYS);
        });
      } else {
        left.current = false;
        toast.success("Entry restored from archive");
      }
    } catch (err) {
      left.current = false;
      toastError(err);
    }
  };

  const remove = async () => {
    try {
      left.current = true;
      if (timer.current) clearTimeout(timer.current);
      if (snap.current.isDraft && isEmptyEntry(snap.current)) {
        pending.current = {};
        await chain.current;
        await api.delete(`${url}?permanent=1`);
        refresh(...JOURNAL_KEYS);
        onClose();
        toast.success("Draft discarded");
        return;
      }
      await flush();
      await api.delete(url);
      refresh(...JOURNAL_KEYS);
      onClose();
      toast.undo("Entry moved to Trash", async () => {
        await api.patch(url, { deletedAt: null }).catch(toastError);
        refresh(...JOURNAL_KEYS);
      });
    } catch (err) {
      left.current = false;
      toastError(err);
    }
  };

  const restore = async () => {
    try {
      await api.patch(url, { deletedAt: null });
      refresh(...JOURNAL_KEYS);
      toast.success("Entry restored");
    } catch (err) {
      toastError(err);
    }
  };

  const purge = async () => {
    const ok = await confirm({
      title: "Delete this entry forever?",
      body: "The entry and photos used only by it will be permanently deleted. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    try {
      left.current = true;
      await api.delete(`${url}?permanent=1`);
      refresh(...JOURNAL_KEYS);
      onClose();
      toast.success("Entry permanently deleted");
    } catch (err) {
      left.current = false;
      toastError(err);
    }
  };

  const onUploaded = useCallback(
    (m: Media) => {
      setMedia((prev) => {
        const next = [...prev, m];
        queue({ mediaIds: next.map((x) => x.id) }, true);
        return next;
      });
    },
    [queue],
  );

  const archived = !!entry.archivedAt;
  const deleted = !!entry.deletedAt;
  const minutes = readingMinutes(words);
  const created = new Date(entry.createdAt);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2 pt-[max(8px,env(safe-area-inset-top))] md:px-5 md:pt-2">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={back} aria-label="Back to journal">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <SaveIndicator state={state} updatedAt={updatedAt} />
        {isDraft && state !== "saving" && <Badge tone="warning" className="text-warning-text">Draft</Badge>}
        <DemoBadge show={entry.isDemo} />
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setPrivate(!isPrivate);
              queue({ isPrivate: !isPrivate }, true);
              toast.info(!isPrivate ? "Private: hidden from previews, search and AI" : "No longer private");
            }}
            aria-pressed={isPrivate}
            aria-label={isPrivate ? "Make entry not private" : "Make entry private"}
            title={isPrivate ? "Private entry" : "Make private"}
            className={cn(isPrivate && "text-primary")}
          >
            {isPrivate ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setPinned(!pinned);
              queue({ pinned: !pinned }, true);
            }}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin" : "Pin to top"}
            title={pinned ? "Unpin" : "Pin to top"}
            className={cn(pinned && "text-primary")}
          >
            <Pin className={cn("h-4 w-4", pinned && "fill-current")} />
          </Button>
          <Menu
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            items={[
              archived ? { label: "Unarchive", icon: ArchiveRestore, onSelect: () => archive(false) } : { label: "Archive", icon: Archive, onSelect: () => archive(true) },
              { type: "separator" },
              deleted
                ? { label: "Delete forever", icon: Trash2, danger: true, onSelect: purge }
                : { label: isDraft && isEmptyEntry(snap.current) ? "Discard draft" : "Delete", icon: Trash2, danger: true, onSelect: remove },
            ]}
          />
          {!deleted && (
            <Button size="sm" onClick={done} className="ml-1">
              <Check className="h-4 w-4" /> Done
            </Button>
          )}
        </div>
      </div>

      {(archived || deleted) && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-2 text-[13px] text-fg-2">
          {deleted ? "This entry is in Trash." : "This entry is archived."}
          <Button size="sm" variant="outline" className="ml-auto" onClick={deleted ? restore : () => archive(false)}>
            <RotateCcw className="h-3.5 w-3.5" /> {deleted ? "Restore" : "Unarchive"}
          </Button>
        </div>
      )}

      <Toolbar editor={editor} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] md:px-8 scroll-thin">
        <div className="mx-auto max-w-[720px]">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
            <label className="inline-flex items-center gap-1.5">
              <span className="sr-only">Entry date</span>
              <input
                type="date"
                value={entryDate}
                required
                onChange={(e) => {
                  if (!e.target.value) return;
                  setEntryDate(e.target.value);
                  queue({ entryDate: e.target.value }, true);
                }}
                className="h-7 rounded-lg border border-line bg-surface px-2 text-[12.5px] font-medium text-fg-2 outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
              />
            </label>
            <span>
              Written {format(created, "MMM d, yyyy 'at' h:mm a")}
              {updatedAt.getTime() - created.getTime() > 60_000 && <> · edited {format(updatedAt, "MMM d, h:mm a")}</>}
            </span>
          </div>

          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            maxLength={200}
            placeholder="Give today a title"
            aria-label="Entry title"
            onChange={(e) => {
              setTitle(e.target.value);
              queue({ title: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editor?.commands.focus("start");
              }
            }}
            className="field-sizing-content font-display w-full resize-none bg-transparent text-[30px] leading-tight font-semibold outline-none placeholder:text-fg-3"
          />

          <MoodPicker
            value={mood}
            onChange={(m) => {
              setMood(m);
              queue({ mood: m }, true);
            }}
          />

          <TagInput
            tags={tags}
            suggestions={allTags?.items.map((t) => t.name) ?? []}
            onChange={(next) => {
              setTags(next);
              queue({ tags: next }, true);
            }}
          />

          <div className="mt-4">
            <EditorContent editor={editor} />
          </div>

          <section aria-label="Photos and files" className="mt-2 border-t border-line pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-fg-2">Photos & files{media.length ? ` · ${media.length}` : ""}</h3>
              <MediaUploader variant="button" label="Attach" accept={`${ACCEPT.imagesAndVideos},application/pdf,audio/*`} onUploaded={onUploaded} disabled={deleted} />
            </div>
            <MediaGrid
              items={media}
              onRemove={(m) => {
                const next = media.filter((x) => x.id !== m.id);
                setMedia(next);
                queue({ mediaIds: next.map((x) => x.id) }, true);
              }}
            />
          </section>

          <p className="mt-6 text-[12px] text-fg-3" aria-live="off">
            {words.toLocaleString()} {words === 1 ? "word" : "words"}
            {minutes > 0 && <> · {minutes} min read</>}
          </p>
        </div>
      </div>
    </div>
  );
}

function MoodPicker({ value, onChange }: { value: string | null; onChange: (m: string | null) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Mood">
      <span className="mr-1 text-[12.5px] text-fg-3">Mood</span>
      {MOODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={active}
            title={active ? `${m.label} (click to clear)` : m.label}
            onClick={() => onChange(active ? null : m.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12.5px] transition-colors",
              active ? "border-primary bg-primary-soft font-medium text-fg" : "border-line text-fg-2 hover:bg-surface-2",
            )}
          >
            <span aria-hidden>{m.emoji}</span>
            <span className={cn(!active && "max-sm:sr-only")}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SaveIndicator({ state, updatedAt }: { state: SaveState; updatedAt: Date }) {
  const base = "flex items-center gap-1.5 px-1 text-[12px] text-fg-3";
  if (state === "pending" || state === "saving")
    return (
      <span className={base} aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  if (state === "error")
    return (
      <span className={cn(base, "text-danger")} aria-live="polite">
        <CloudOff className="h-3 w-3" /> Not saved
      </span>
    );
  if (state === "saved")
    return (
      <span className={base} aria-live="polite">
        <Check className="h-3 w-3 text-success" /> Saved
      </span>
    );
  return <span className={base}>Saved {format(updatedAt, "h:mm a")}</span>;
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const btn = (label: string, icon: ReactNode, run: () => void, active = false, disabled = false) => (
    <button
      key={label}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={!editor || disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
      )}
    >
      {icon}
    </button>
  );
  const c = () => editor!.chain().focus();
  const sep = (k: string) => <span key={k} className="mx-1 h-4 w-px shrink-0 bg-line" />;
  const i = "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-3 py-1.5 md:px-5 scroll-thin" role="toolbar" aria-label="Formatting">
      {btn("Heading", <Heading1 className={i} />, () => c().toggleHeading({ level: 1 }).run(), editor?.isActive("heading", { level: 1 }))}
      {btn("Subheading", <Heading2 className={i} />, () => c().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
      {sep("s1")}
      {btn("Bold", <Bold className={i} />, () => c().toggleBold().run(), editor?.isActive("bold"))}
      {btn("Italic", <Italic className={i} />, () => c().toggleItalic().run(), editor?.isActive("italic"))}
      {btn("Strikethrough", <Strikethrough className={i} />, () => c().toggleStrike().run(), editor?.isActive("strike"))}
      {sep("s2")}
      {btn("Bullet list", <List className={i} />, () => c().toggleBulletList().run(), editor?.isActive("bulletList"))}
      {btn("Numbered list", <ListOrdered className={i} />, () => c().toggleOrderedList().run(), editor?.isActive("orderedList"))}
      {btn("Checklist", <ListChecks className={i} />, () => c().toggleTaskList().run(), editor?.isActive("taskList"))}
      {btn("Quote", <Quote className={i} />, () => c().toggleBlockquote().run(), editor?.isActive("blockquote"))}
      {sep("s3")}
      {btn("Undo", <Undo2 className={i} />, () => c().undo().run(), false, !editor?.can().undo())}
      {btn("Redo", <Redo2 className={i} />, () => c().redo().run(), false, !editor?.can().redo())}
    </div>
  );
}

function TagInput({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const name = raw.trim().replace(/^#/, "").slice(0, 40);
    setDraft("");
    if (!name || tags.some((t) => t.toLowerCase() === name.toLowerCase())) return;
    if (tags.length >= 20) return toast.error("An entry can have up to 20 tags");
    onChange([...tags, name]);
  };
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-2 text-[12.5px] text-fg-2">
          #{t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded p-0.5 text-fg-3 hover:bg-line hover:text-fg" aria-label={`Remove tag ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list="journal-tag-suggestions"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? "Add tag" : "Add tags…"}
        aria-label="Add tag"
        className="h-7 min-w-[90px] flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3"
      />
      <datalist id="journal-tag-suggestions">
        {suggestions
          .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
