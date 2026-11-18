"use client";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Progress, Segmented } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { formatValue } from "./goal-card";
import type { GoalListItem } from "./types";

export function UpdateProgressDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal: GoalListItem }) {
  const [mode, setMode] = useState<"set" | "add">("set");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setMode("set");
      setValue(String(goal.currentValue));
    }
  }, [open, goal.currentValue]);

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && (mode === "add" || n >= 0);
  const next = valid ? Math.max(0, mode === "set" ? n : goal.currentValue + n) : goal.currentValue;
  const pct = goal.targetValue ? Math.min(100, Math.round((next / goal.targetValue) * 100)) : 0;
  const unit = goal.unit ? ` ${goal.unit}` : "";

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const res = await api.post<{ reached: boolean }>(`/api/goals/${goal.id}/progress`, mode === "set" ? { value: n } : { delta: n });
      await refresh("/api/goals", ...SUMMARY_KEYS);
      toast.success(res.reached ? `Target reached — ${formatValue(next)}${unit}` : `Progress updated to ${formatValue(next)}${unit}`);
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Update progress"
      description={goal.targetValue ? `Target: ${formatValue(goal.targetValue)}${unit}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save()} loading={busy} disabled={!valid}>
            Log progress
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setValue(m === "set" ? String(goal.currentValue) : "");
          }}
          options={[
            { value: "set", label: "Set new total" },
            { value: "add", label: "Add amount" },
          ]}
          size="sm"
        />
        <Field label={mode === "set" ? `Current value${unit ? ` (${goal.unit})` : ""}` : `Amount to add${unit ? ` (${goal.unit})` : ""}`}>
          <Input autoFocus type="number" inputMode="decimal" step="any" min={mode === "set" ? 0 : undefined} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {goal.targetValue != null && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-fg-2">
              <span>
                {formatValue(goal.currentValue)} → <span className="font-medium text-fg">{formatValue(next)}</span>
                {unit}
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} color={goal.color} />
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
