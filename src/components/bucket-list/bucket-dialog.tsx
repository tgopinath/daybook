"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { ACCEPT, type Media } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch, Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { MediaThumb, MediaUploader, MediaViewer } from "@/components/media/media";
import { cn } from "@/lib/utils";
import { BUCKET_CATEGORIES, BUCKET_META, type BucketCategory } from "./meta";
import type { BucketItemDTO } from "./types";

export const BUCKET_KEYS = ["/api/bucket-list", "/api/timeline", ...SUMMARY_KEYS];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Draft = {
  title: string;
  description: string;
  category: BucketCategory;
  targetDate: string;
  image: Media | null;
  completed: boolean;
  completedOn: string;
};

function toDraft(item?: BucketItemDTO | null, init?: Partial<Draft>): Draft {
  return {
    title: item?.title ?? "",
    description: item?.description ?? "",
    category: ((item?.category as BucketCategory) ?? init?.category ?? "Travel") as BucketCategory,
    targetDate: item?.targetDate ? item.targetDate.slice(0, 10) : "",
    image: item?.image ?? null,
    completed: !!item?.completedAt,
    completedOn: item?.completedAt ? item.completedAt.slice(0, 10) : todayKey(),
    ...init,
  };
}

/** Create / edit a bucket list item. `item` null = new. */
export function BucketDialog({
  open,
  onOpenChange,
  item,
  initialCategory,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: BucketItemDTO | null;
  initialCategory?: BucketCategory;
  onSaved?: (item: BucketItemDTO, created: boolean) => void;
  onDelete?: (item: BucketItemDTO) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(item, initialCategory ? { category: initialCategory } : undefined));
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  useEffect(() => {
    if (open) setD(toDraft(item, !item && initialCategory ? { category: initialCategory } : undefined));
    // Reset only when the dialog opens or switches item (not on background revalidation).
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!d.title.trim()) {
      toast.error("Give your adventure a name");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: d.title.trim(),
        description: d.description.trim() || null,
        category: d.category,
        targetDate: d.targetDate || null,
        imageMediaId: d.image?.id ?? null,
      };
      let saved: BucketItemDTO;
      if (item) {
        const wasDone = !!item.completedAt;
        const doneChanged = wasDone !== d.completed || (d.completed && item.completedAt?.slice(0, 10) !== d.completedOn);
        ({ item: saved } = await api.patch<{ item: BucketItemDTO }>(`/api/bucket-list/${item.id}`, {
          ...payload,
          ...(doneChanged ? { completed: d.completed, ...(d.completed && d.completedOn ? { completedOn: d.completedOn } : {}) } : {}),
        }));
      } else {
        ({ item: saved } = await api.post<{ item: BucketItemDTO }>("/api/bucket-list", { ...payload, completed: d.completed, ...(d.completed && d.completedOn ? { completedOn: d.completedOn } : {}) }));
      }
      await refresh(...BUCKET_KEYS);
      toast.success(item ? "Saved" : "Added to your bucket list");
      onSaved?.(saved, !item);
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
      title={item ? "Edit adventure" : "New adventure"}
      description={item ? undefined : "Something you'd love to do, see or become."}
      footer={
        <div className="flex w-full items-center gap-2">
          {item && onDelete && (
            <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => onDelete(item)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save()} loading={saving}>
              {item ? "Save" : "Add to list"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="What do you want to do?">
          <Input autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="See the northern lights" maxLength={200} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Category</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {BUCKET_CATEGORIES.map((c) => {
              const M = BUCKET_META[c];
              const on = d.category === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("category", c)}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors", on ? "text-fg" : "border-line text-fg-2 hover:bg-surface-2")}
                  style={on ? { borderColor: M.color, background: `color-mix(in srgb, ${M.color} 14%, var(--surface))` } : undefined}
                >
                  <M.icon className="h-3.5 w-3.5" style={{ color: M.color }} />
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Tell yourself why (optional)">
          <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="Why it matters, who you'd go with, little details…" maxLength={5000} />
        </Field>

        <Field label="Target date (optional)" hint="A rough date is fine — it's a dream, not a deadline.">
          <Input type="date" value={d.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Photo (optional)</span>
          {d.image ? (
            <div className="flex items-center gap-3">
              <MediaThumb media={d.image} alt="Bucket list photo" className="h-20 w-28 aspect-auto" onClick={() => setViewer(0)} />
              <div className="flex flex-col gap-1.5">
                <MediaUploader variant="button" multiple={false} accept={ACCEPT.images} label="Replace" onUploaded={(m) => set("image", m)} />
                <Button size="sm" variant="ghost" onClick={() => set("image", null)} className="justify-start text-fg-2">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
              <MediaViewer items={[d.image]} index={viewer} onIndexChange={setViewer} />
            </div>
          ) : (
            <MediaUploader multiple={false} accept={ACCEPT.images} label="Add an inspiring photo" hint="Drop a photo here, or click to choose" onUploaded={(m) => set("image", m)} />
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-[12px] bg-surface-2 p-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] font-medium">I&apos;ve done this</span>
            <Switch checked={d.completed} onChange={(v) => set("completed", v)} label="Completed" />
          </label>
          {d.completed && (
            <Field label="When?">
              <Input type="date" value={d.completedOn} max={todayKey()} onChange={(e) => set("completedOn", e.target.value)} />
            </Field>
          )}
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
