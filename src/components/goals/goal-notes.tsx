"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import { api, refresh } from "@/lib/client";

/** Notes textarea that autosaves ~800ms after typing stops (and on blur / unmount). */
export function GoalNotes({ goalId, initial, readOnly }: { goalId: string; initial: string | null; readOnly?: boolean }) {
  const [value, setValue] = useState(initial ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const saved = useRef(initial ?? "");
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt server value when it changes and we have no unsaved edits.
  useEffect(() => {
    if (pending.current === null && (initial ?? "") !== saved.current) {
      saved.current = initial ?? "";
      setValue(initial ?? "");
    }
  }, [initial]);

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pending.current;
    if (v === null || v === saved.current) {
      pending.current = null;
      return;
    }
    setState("saving");
    try {
      await api.patch(`/api/goals/${goalId}`, { notes: v || null });
      saved.current = v;
      if (pending.current === v) pending.current = null;
      setState("saved");
      void refresh("/api/goals");
    } catch (err) {
      setState("idle");
      toastError(err);
    }
  }

  useEffect(
    () => () => {
      if (pending.current !== null && pending.current !== saved.current) {
        void api.patch(`/api/goals/${goalId}`, { notes: pending.current || null }).then(() => refresh("/api/goals"), () => {});
      }
    },
    [goalId],
  );

  return (
    <div>
      <Textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => {
          setValue(e.target.value);
          pending.current = e.target.value;
          setState("idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onBlur={flush}
        placeholder="Plans, reflections, links… saved automatically"
        className="min-h-[140px] resize-y"
        maxLength={20000}
        aria-label="Goal notes"
      />
      <p className="mt-1 flex h-4 items-center gap-1 text-[11.5px] text-fg-3" aria-live="polite">
        {state === "saving" && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </>
        )}
        {state === "saved" && (
          <>
            <Check className="h-3 w-3 text-success" /> Saved
          </>
        )}
      </p>
    </div>
  );
}
