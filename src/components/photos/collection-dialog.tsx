"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { SUMMARY_KEYS, api, refresh } from "@/lib/client";
import type { CollectionItem } from "@/components/memories/types";

export function CollectionDialog({
  open,
  onOpenChange,
  collection,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  collection?: CollectionItem | null;
  onSaved?: (c: CollectionItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(collection?.title ?? "");
    setDescription(collection?.description ?? "");
  }, [open, collection]);

  const save = async () => {
    if (!title.trim()) return toast.error("Name the collection");
    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim() || null };
      const res = collection
        ? await api.patch<{ item: CollectionItem }>(`/api/photo-collections/${collection.id}`, payload)
        : await api.post<{ item: CollectionItem }>("/api/photo-collections", payload);
      await refresh("/api/photo-collections", "/api/photos", ...SUMMARY_KEYS);
      toast.success(collection ? "Collection renamed" : "Collection created");
      onSaved?.(res.item);
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={collection ? "Rename collection" : "New collection"}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {collection ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Garden, Pets, Food…" autoFocus maxLength={120} />
        </Field>
        <Field label="Description (optional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Small dialog to add or remove tags on several photos. */
export function TagDialog({ open, onOpenChange, onApply, known }: { open: boolean; onOpenChange: (o: boolean) => void; onApply: (tags: string[], mode: "add" | "remove") => Promise<void>; known: string[] }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const tags = text
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
  const run = async (mode: "add" | "remove") => {
    if (!tags.length) return toast.error("Type at least one tag");
    setBusy(true);
    try {
      await onApply(tags, mode);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Tag photos"
      description="Separate tags with commas."
      footer={
        <>
          <Button variant="ghost" onClick={() => void run("remove")} disabled={busy}>
            Remove tags
          </Button>
          <Button onClick={() => void run("add")} loading={busy}>
            Add tags
          </Button>
        </>
      }
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="family, beach" autoFocus aria-label="Tags" onKeyDown={(e) => e.key === "Enter" && void run("add")} />
      {known.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {known.slice(0, 20).map((t) => (
            <button key={t} type="button" onClick={() => setText((s) => (s.trim() ? `${s.replace(/,\s*$/, "")}, ${t}` : t))} className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-fg-2 hover:text-fg">
              #{t}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
