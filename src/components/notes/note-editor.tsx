"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Archive, ArchiveRestore, Bold, Check, CloudOff, Code, Copy, Heading1, Heading2, Heading3, Italic, List, ListChecks,
  ListOrdered, Loader2, MoreHorizontal, Pin, Quote, Redo2, RotateCcw, Star, Strikethrough, Trash2, Undo2, X,
} from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { DemoBadge, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { NoteFull, NotesMeta } from "./types";

type Patch = Partial<{ title: string; content: Record<string, unknown>; plainText: string; categoryId: string | null; tags: string[]; pinned: boolean; favorite: boolean }>;
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function NoteEditor({ id, onBack, onClosed, onSelect }: { id: string; onBack: () => void; onClosed: () => void; onSelect: (id: string) => void }) {
  const { data, error } = useApi<{ item: NoteFull }>(`/api/notes/${id}`, { revalidateOnFocus: false });
  const note = data?.item.id === id ? data.item : null;
  if (error && !note)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-fg-2">{error.message === "Note not found" ? "This note doesn't exist anymore." : error.message}</p>
        <Button variant="outline" size="sm" onClick={onClosed}>
          Back to notes
        </Button>
      </div>
    );
  if (!note)
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  return <EditorInner key={note.id} note={note} onBack={onBack} onClosed={onClosed} onSelect={onSelect} />;
}

function EditorInner({ note, onBack, onClosed, onSelect }: { note: NoteFull; onBack: () => void; onClosed: () => void; onSelect: (id: string) => void }) {
  const { data: meta } = useApi<NotesMeta>("/api/notes/meta");
  const [title, setTitle] = useState(note.title === "Untitled" && !note.excerpt ? "" : note.title);
  const [pinned, setPinned] = useState(note.pinned);
  const [favorite, setFavorite] = useState(note.favorite);
  const [categoryId, setCategoryId] = useState(note.categoryId);
  const [tags, setTags] = useState(note.tags.map((t) => t.name));
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date>(new Date(note.updatedAt));
  const [newCatOpen, setNewCatOpen] = useState(false);
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const url = `/api/notes/${note.id}`;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const payload = pending.current;
    if (!Object.keys(payload).length) return;
    pending.current = {};
    setState("saving");
    try {
      await api.patch(url, payload);
      setState("saved");
      setSavedAt(new Date());
      const structural = "tags" in payload || "categoryId" in payload || "pinned" in payload || "favorite" in payload;
      refresh("/api/notes?", "/api/search", ...(structural ? ["/api/notes/meta", ...SUMMARY_KEYS] : []));
    } catch (err) {
      pending.current = { ...payload, ...pending.current };
      setState("error");
      toastError(err);
    }
  }, [url]);

  const queue = useCallback(
    (patch: Patch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  // Save anything outstanding when switching notes or leaving the page.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: note.content && Object.keys(note.content).length ? note.content : undefined,
    immediatelyRender: false,
    editorProps: { attributes: { class: "prose-editor min-h-[45vh] pb-24 text-fg", "aria-label": "Note body" } },
    onUpdate: ({ editor }) => queue({ content: editor.getJSON() as Record<string, unknown>, plainText: editor.getText({ blockSeparator: "\n" }) }),
  });

  // Focus the title for brand-new empty notes.
  useEffect(() => {
    if (!note.excerpt && note.title === "Untitled") titleRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePinned = () => {
    setPinned(!pinned);
    queue({ pinned: !pinned }, true);
  };
  const toggleFavorite = () => {
    setFavorite(!favorite);
    queue({ favorite: !favorite }, true);
  };

  const duplicate = async () => {
    try {
      await flush();
      const res = await api.post<{ item: NoteFull }>(`${url}/duplicate`);
      refresh("/api/notes", ...SUMMARY_KEYS);
      toast.success("Note duplicated");
      onSelect(res.item.id);
    } catch (err) {
      toastError(err);
    }
  };
  const archive = async (archived: boolean) => {
    try {
      await flush();
      await api.patch(url, { archived });
      refresh("/api/notes", ...SUMMARY_KEYS);
      if (archived) {
        onClosed();
        toast.undo("Note archived", async () => {
          await api.patch(url, { archived: false }).catch(toastError);
          refresh("/api/notes", ...SUMMARY_KEYS);
        });
      } else toast.success("Note restored from archive");
    } catch (err) {
      toastError(err);
    }
  };
  const remove = async () => {
    try {
      await flush();
      await api.delete(url);
      refresh("/api/notes", ...SUMMARY_KEYS);
      onClosed();
      toast.undo("Note moved to Recently Deleted", async () => {
        await api.patch(url, { deletedAt: null }).catch(toastError);
        refresh("/api/notes", ...SUMMARY_KEYS);
      });
    } catch (err) {
      toastError(err);
    }
  };
  const restore = async () => {
    try {
      await api.patch(url, { deletedAt: null });
      refresh("/api/notes", ...SUMMARY_KEYS);
      toast.success("Note restored");
    } catch (err) {
      toastError(err);
    }
  };

  const archived = !!note.archivedAt;
  const deleted = !!note.deletedAt;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2 md:px-5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to notes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <SaveIndicator state={state} savedAt={savedAt} />
        <DemoBadge show={note.isDemo} />
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={togglePinned} aria-pressed={pinned} title={pinned ? "Unpin" : "Pin to top"} className={cn(pinned && "text-primary")}>
            <Pin className={cn("h-4 w-4", pinned && "fill-current")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={toggleFavorite} aria-pressed={favorite} title={favorite ? "Remove from favorites" : "Add to favorites"} className={cn(favorite && "text-warning")}>
            <Star className={cn("h-4 w-4", favorite && "fill-current")} />
          </Button>
          <Menu
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            items={[
              { label: "Duplicate", icon: Copy, onSelect: duplicate },
              archived ? { label: "Unarchive", icon: ArchiveRestore, onSelect: () => archive(false) } : { label: "Archive", icon: Archive, onSelect: () => archive(true) },
              { type: "separator" },
              { label: "Delete", icon: Trash2, danger: true, onSelect: remove },
            ]}
          />
        </div>
      </div>

      {(archived || deleted) && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-2 text-[13px] text-fg-2">
          {deleted ? "This note is in Recently Deleted." : "This note is archived."}
          <Button size="sm" variant="outline" className="ml-auto" onClick={deleted ? restore : () => archive(false)}>
            <RotateCcw className="h-3.5 w-3.5" /> {deleted ? "Restore" : "Unarchive"}
          </Button>
        </div>
      )}

      <Toolbar editor={editor} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 md:px-8 scroll-thin">
        <div className="mx-auto max-w-[720px]">
          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            maxLength={200}
            placeholder="Untitled"
            aria-label="Note title"
            onChange={(e) => {
              setTitle(e.target.value);
              queue({ title: e.target.value.trim() || "Untitled" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editor?.commands.focus("start");
              }
            }}
            className="field-sizing-content w-full resize-none bg-transparent text-[26px] leading-tight font-semibold tracking-tight outline-none placeholder:text-fg-3"
          />

          <div className="mt-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="w-[170px]">
              <Select
                aria-label="Category"
                value={categoryId ?? ""}
                className="h-8 text-[14px]"
                onChange={(e) => {
                  if (e.target.value === "__new") return setNewCatOpen(true);
                  const v = e.target.value || null;
                  setCategoryId(v);
                  queue({ categoryId: v }, true);
                }}
              >
                <option value="">No category</option>
                {meta?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new">+ New category…</option>
              </Select>
            </div>
            <TagInput
              tags={tags}
              suggestions={meta?.tags.map((t) => t.name) ?? []}
              onChange={(next) => {
                setTags(next);
                queue({ tags: next }, true);
              }}
            />
          </div>

          <EditorContent editor={editor} />
        </div>
      </div>

      <NewCategoryDialog
        open={newCatOpen}
        onOpenChange={setNewCatOpen}
        onCreated={(id) => {
          setCategoryId(id);
          queue({ categoryId: id }, true);
        }}
      />
    </div>
  );
}

function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: Date }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(h);
  }, []);
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
  return <span className={base}>Edited {formatDistanceToNow(savedAt, { addSuffix: true })}</span>;
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
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40",
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
      {btn("Heading 1", <Heading1 className={i} />, () => c().toggleHeading({ level: 1 }).run(), editor?.isActive("heading", { level: 1 }))}
      {btn("Heading 2", <Heading2 className={i} />, () => c().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
      {btn("Heading 3", <Heading3 className={i} />, () => c().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
      {sep("s1")}
      {btn("Bold", <Bold className={i} />, () => c().toggleBold().run(), editor?.isActive("bold"))}
      {btn("Italic", <Italic className={i} />, () => c().toggleItalic().run(), editor?.isActive("italic"))}
      {btn("Strikethrough", <Strikethrough className={i} />, () => c().toggleStrike().run(), editor?.isActive("strike"))}
      {sep("s2")}
      {btn("Bullet list", <List className={i} />, () => c().toggleBulletList().run(), editor?.isActive("bulletList"))}
      {btn("Numbered list", <ListOrdered className={i} />, () => c().toggleOrderedList().run(), editor?.isActive("orderedList"))}
      {btn("Checklist", <ListChecks className={i} />, () => c().toggleTaskList().run(), editor?.isActive("taskList"))}
      {btn("Quote", <Quote className={i} />, () => c().toggleBlockquote().run(), editor?.isActive("blockquote"))}
      {btn("Code block", <Code className={i} />, () => c().toggleCodeBlock().run(), editor?.isActive("codeBlock"))}
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
    if (tags.length >= 20) return toast.error("A note can have up to 20 tags");
    onChange([...tags, name]);
  };
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-2 text-[12px] text-fg-2">
          #{t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded p-0.5 text-fg-3 hover:bg-line hover:text-fg" aria-label={`Remove tag ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list="note-tag-suggestions"
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
        className="h-6 min-w-[90px] flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-3"
      />
      <datalist id="note-tag-suggestions">
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

const CAT_COLORS = ["#993399", "#20A779", "#E9A23B", "#E45D5D", "#3B9BE9", "#8B5CF6"];

function NewCategoryDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CAT_COLORS[0]!);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ item: { id: string } }>("/api/notes/categories", { name: name.trim(), color });
      await refresh("/api/notes/meta");
      onCreated(res.item.id);
      onOpenChange(false);
      setName("");
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="New category"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Ideas" />
        </Field>
        <div className="flex gap-2" role="radiogroup" aria-label="Color">
          {CAT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition", color === c && "ring-2")}
              style={{ background: c, ["--tw-ring-color" as string]: c }}
            />
          ))}
        </div>
      </form>
    </Dialog>
  );
}
