"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Star } from "lucide-react";
import { Card } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import { api, refresh } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Reflection } from "./types";

type Draft = Omit<Reflection, "weekStart" | "updatedAt">;
const EMPTY: Draft = { rating: null, wins: "", challenges: "", lessons: "", nextWeekFocus: "" };

const FIELDS: { key: keyof Omit<Draft, "rating">; label: string; placeholder: string }[] = [
  { key: "wins", label: "Wins", placeholder: "What went well, big or small?" },
  { key: "challenges", label: "Challenges", placeholder: "What felt hard this week?" },
  { key: "lessons", label: "Lessons", placeholder: "What did you learn about yourself?" },
  { key: "nextWeekFocus", label: "Focus for next week", placeholder: "One or two things that matter most" },
];

const RATING_WORDS = ["", "Rough", "Meh", "Okay", "Good", "Great"];

/** The user's written reflection for a week; autosaves shortly after typing stops. */
export function ReflectionCard({ weekStart, initial }: { weekStart: string; initial: Reflection | null }) {
  const [draft, setDraft] = useState<Draft>(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">(initial?.updatedAt ? "saved" : "idle");
  const pending = useRef<Partial<Draft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    setStatus("saving");
    try {
      await api.put("/api/weekly-review", { weekStart, ...changes });
      setStatus("saved");
      refresh("/api/weekly-review/history");
    } catch (err) {
      pending.current = { ...changes, ...pending.current };
      setStatus("idle");
      toastError(err);
    }
  }

  // Save anything pending when switching weeks or leaving the page.
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof Draft>(key: K, value: Draft[K], immediate = false) {
    setDraft((d) => ({ ...d, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void flush();
    else timer.current = setTimeout(() => void flush(), 900);
  }

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold">Your reflection</h2>
          <p className="mt-0.5 text-[12px] text-fg-3">In your own words. Saves as you type.</p>
        </div>
        <span className="flex h-6 items-center gap-1 text-[12px] text-fg-3" aria-live="polite">
          {status === "saving" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="h-3.5 w-3.5 text-success" /> Saved
            </>
          )}
        </span>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-[13px] font-medium text-fg-2">How did this week feel?</p>
        <div role="radiogroup" aria-label="Week rating" className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = (draft.rating ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={draft.rating === n}
                aria-label={`${n} of 5 – ${RATING_WORDS[n]}`}
                onClick={() => update("rating", draft.rating === n ? null : n, true)}
                className="flex h-11 w-11 items-center justify-center rounded-[10px] outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-primary/25"
              >
                <Star className={cn("h-6 w-6", on ? "fill-[var(--warning-fill)] text-warning" : "text-fg-3")} />
              </button>
            );
          })}
          {draft.rating != null && <span className="ml-1 text-[13px] font-medium text-fg-2">{RATING_WORDS[draft.rating]}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">{f.label}</span>
            <Textarea
              value={draft[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
              onBlur={() => void flush()}
              placeholder={f.placeholder}
              maxLength={5000}
              className="min-h-[84px]"
            />
          </label>
        ))}
      </div>
    </Card>
  );
}
