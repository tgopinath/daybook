"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { MOODS, moodMeta, type Mood } from "@/lib/moods";
import { cleanFactors, INTENSITY_LABELS, MOOD_FACTORS, normalizeFactor } from "@/lib/mood";
import { cn } from "@/lib/utils";
import type { MoodEntryDTO, MoodStats } from "./types";

export const refreshMood = () => refresh("/api/mood", "/api/dashboard", "/api/weekly-review", ...SUMMARY_KEYS);

/** Soft tinted background for a mood (fills only; text stays on tokens). */
export const moodTint = (mood: string | null | undefined, pct = 22) => {
  const m = moodMeta(mood);
  return m ? `color-mix(in oklab, ${m.color} ${pct}%, var(--surface))` : undefined;
};

/** Big emoji buttons for the 8 moods (≥44px touch targets). */
export function MoodPicker({ value, onChange, compact, disabled }: { value: Mood | null; onChange: (m: Mood) => void; compact?: boolean; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="How are you feeling?" className={cn("grid gap-2", compact ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-4 sm:grid-cols-8")}>
      {MOODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m.value)}
            style={active ? { background: moodTint(m.value, 26), borderColor: m.color } : undefined}
            className={cn(
              "flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-[12px] border border-line bg-surface transition-all outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/25 disabled:opacity-60",
              compact ? "py-1.5" : "py-2.5",
              active && "border-2 shadow-card",
            )}
          >
            <span className={cn("leading-none", compact ? "text-[24px]" : "text-[28px] sm:text-[30px]")} aria-hidden>
              {m.emoji}
            </span>
            <span className={cn("font-medium", compact ? "text-[11px]" : "text-[12px]", active ? "text-fg" : "text-fg-2")}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function IntensityPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Intensity" className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} – ${INTENSITY_LABELS[n]}`}
            onClick={() => onChange(n)}
            className={cn(
              "flex h-11 min-w-11 flex-1 items-center justify-center rounded-[10px] border text-[14px] font-semibold tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-primary/25",
              value === n ? "border-primary bg-primary text-on-primary" : n < value ? "border-line bg-primary-soft text-fg" : "border-line bg-surface text-fg-2 hover:bg-surface-2",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-fg-3">{INTENSITY_LABELS[value]}</p>
    </div>
  );
}

export function FactorChips({ value, onChange, known = [] }: { value: string[]; onChange: (f: string[]) => void; known?: string[] }) {
  const [custom, setCustom] = useState("");
  const [adding, setAdding] = useState(false);
  const lower = new Set(value.map((v) => v.toLowerCase()));
  const options = cleanFactors([...MOOD_FACTORS, ...known, ...value]);
  const toggle = (f: string) => onChange(lower.has(f.toLowerCase()) ? value.filter((v) => v.toLowerCase() !== f.toLowerCase()) : [...value, f]);
  const addCustom = () => {
    const f = normalizeFactor(custom);
    if (f && !lower.has(f.toLowerCase())) onChange([...value, f]);
    setCustom("");
    setAdding(false);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((f) => {
        const on = lower.has(f.toLowerCase());
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(f)}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-[14px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-primary/25",
              on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-fg-2 hover:bg-surface-2 hover:text-fg",
            )}
          >
            {f}
            {on && <X className="h-3 w-3" aria-hidden />}
          </button>
        );
      })}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
          className="flex items-center gap-1"
        >
          <input
            autoFocus
            value={custom}
            maxLength={32}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={addCustom}
            onKeyDown={(e) => e.key === "Escape" && (setCustom(""), setAdding(false))}
            placeholder="Your own…"
            aria-label="Custom factor"
            className="h-9 w-32 rounded-full border border-primary bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-fg-3"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    </div>
  );
}

/** Full check-in form: mood, intensity, note and factors. Creates or edits. */
export function CheckinForm({
  entry,
  date,
  onDone,
  onCancel,
  submitLabel,
}: {
  entry?: MoodEntryDTO;
  date?: string; // backfill a past day
  onDone?: (e: MoodEntryDTO) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { data: stats } = useApi<MoodStats>("/api/mood/stats?range=90d");
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null);
  const [intensity, setIntensity] = useState(entry?.intensity ?? 3);
  const [note, setNote] = useState(entry?.note ?? "");
  const [factors, setFactors] = useState<string[]>(entry?.factors ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!mood) return toast.info("Pick the mood that fits best first");
    setSaving(true);
    try {
      const payload = { mood, intensity, note: note.trim() || null, factors };
      const res = entry
        ? await api.patch<{ item: MoodEntryDTO }>(`/api/mood/${entry.id}`, payload)
        : await api.post<{ item: MoodEntryDTO }>("/api/mood", { ...payload, ...(date ? { date } : {}) });
      toast.success(entry ? "Check-in updated" : `Logged: feeling ${moodMeta(mood)?.label.toLowerCase()}`);
      refreshMood();
      if (!entry) {
        setMood(null);
        setIntensity(3);
        setNote("");
        setFactors([]);
      }
      onDone?.(res.item);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <MoodPicker value={mood} onChange={setMood} />
      <div className="grid gap-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-2">How strong is it?</p>
          <IntensityPicker value={intensity} onChange={setIntensity} />
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-fg-2">What&apos;s behind this feeling?</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Optional — a few words is plenty" className="min-h-[72px]" />
        </label>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-fg-2">What&apos;s influencing it?</p>
        <FactorChips value={factors} onChange={setFactors} known={stats?.knownFactors} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={() => void save()} loading={saving} disabled={!mood}>
          {submitLabel ?? (entry ? "Save changes" : "Save check-in")}
        </Button>
      </div>
    </div>
  );
}
