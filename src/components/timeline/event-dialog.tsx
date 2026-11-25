"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { ACCEPT, type Media } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { MediaGrid, MediaUploader } from "@/components/media/media";
import { cn } from "@/lib/utils";
import { TIMELINE_CATEGORIES, TIMELINE_META, type DatePrecision, type TimelineCategory } from "./meta";
import type { TimelineEventDTO } from "./types";

export const TIMELINE_KEYS = ["/api/timeline", ...SUMMARY_KEYS];

export type EventInit = { year?: number; category?: TimelineCategory };

type Draft = {
  title: string;
  description: string;
  category: TimelineCategory;
  precision: DatePrecision;
  day: string; // yyyy-MM-dd
  month: string; // yyyy-MM
  year: string; // yyyy
  media: Media[];
};

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");

function toDraft(item: TimelineEventDTO | null, init?: EventInit): Draft {
  if (item) {
    const k = item.dateKey;
    return {
      title: item.title,
      description: item.description ?? "",
      category: (TIMELINE_CATEGORIES as readonly string[]).includes(item.category) ? (item.category as TimelineCategory) : "Personal",
      precision: item.datePrecision,
      day: k,
      month: k.slice(0, 7),
      year: k.slice(0, 4),
      media: item.media,
    };
  }
  const y = init?.year ?? now.getFullYear();
  const isThisYear = y === now.getFullYear();
  return {
    title: "",
    description: "",
    category: init?.category ?? "Personal",
    precision: init?.year && !isThisYear ? "year" : "day",
    day: isThisYear ? `${y}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` : `${y}-01-01`,
    month: isThisYear ? `${y}-${pad(now.getMonth() + 1)}` : `${y}-01`,
    year: String(y),
    media: [],
  };
}

function dateValue(d: Draft): string | null {
  if (d.precision === "day") return /^\d{4}-\d{2}-\d{2}$/.test(d.day) ? d.day : null;
  if (d.precision === "month") return /^\d{4}-\d{2}$/.test(d.month) ? d.month : null;
  return /^\d{4}$/.test(d.year) ? d.year : null;
}

export function EventDialog({
  open,
  onOpenChange,
  item,
  init,
  onDelete,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: TimelineEventDTO | null;
  init?: EventInit;
  onDelete?: (item: TimelineEventDTO) => void;
  onSaved?: (item: TimelineEventDTO) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(item, init));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setD(toDraft(item, init));
    // Reset only when the dialog opens or switches item (not on background revalidation).
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!d.title.trim()) return toast.error("Give this moment a title");
    const date = dateValue(d);
    if (!date) return toast.error(d.precision === "year" ? "Enter a four-digit year" : "Pick a date");
    setSaving(true);
    try {
      const payload = {
        title: d.title.trim(),
        description: d.description.trim() || null,
        category: d.category,
        date,
        datePrecision: d.precision,
        mediaIds: d.media.map((m) => m.id),
      };
      const res = item
        ? await api.patch<{ item: TimelineEventDTO }>(`/api/timeline/${item.id}`, payload)
        : await api.post<{ item: TimelineEventDTO }>("/api/timeline", payload);
      await refresh(...TIMELINE_KEYS);
      toast.success(item ? "Saved" : "Added to your timeline");
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
      title={item ? "Edit moment" : "Add a moment"}
      description={item ? undefined : "A chapter, a milestone, a day you'll always remember."}
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
              {item ? "Save" : "Add to timeline"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="What happened?">
          <Input autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Moved to Bengaluru" maxLength={200} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">When?</span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<DatePrecision>
              size="sm"
              value={d.precision}
              onChange={(p) => set("precision", p)}
              options={[
                { value: "day", label: "Day" },
                { value: "month", label: "Month" },
                { value: "year", label: "Year" },
              ]}
            />
            <div className="min-w-[160px] flex-1">
              {d.precision === "day" && <Input type="date" aria-label="Date" value={d.day} onChange={(e) => setD((x) => ({ ...x, day: e.target.value, month: e.target.value.slice(0, 7), year: e.target.value.slice(0, 4) }))} />}
              {d.precision === "month" && <Input type="month" aria-label="Month" value={d.month} onChange={(e) => setD((x) => ({ ...x, month: e.target.value, year: e.target.value.slice(0, 4) }))} />}
              {d.precision === "year" && (
                <Input type="number" inputMode="numeric" aria-label="Year" min={1900} max={2100} value={d.year} onChange={(e) => set("year", e.target.value.slice(0, 4))} placeholder="2009" />
              )}
            </div>
          </div>
          <span className="text-xs text-fg-3">Not sure of the exact day? Just pick the month or year.</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Chapter</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {TIMELINE_CATEGORIES.map((c) => {
              const M = TIMELINE_META[c];
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

        <Field label="The story (optional)">
          <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="Who was there, how it felt, what changed…" maxLength={10_000} className="min-h-[110px]" />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg-2">Photos (optional)</span>
          <MediaGrid items={d.media} onRemove={(m) => set("media", d.media.filter((x) => x.id !== m.id))} cols="grid-cols-4 sm:grid-cols-5" />
          <MediaUploader
            variant={d.media.length ? "button" : "zone"}
            accept={ACCEPT.imagesAndVideos}
            label="Add photos"
            hint="Old scans and new snaps are both welcome"
            onUploaded={(m) => setD((x) => (x.media.some((y) => y.id === m.id) ? x : { ...x, media: [...x.media, m].slice(0, 30) }))}
          />
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
