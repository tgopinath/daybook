"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { amountInRange, parseAmount, toInputString } from "@/lib/money";
import { ALL_CATEGORIES, DEFAULT_CATEGORIES, EVERY_MONTH, addMonths, formatMonth } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { BudgetBar } from "./overview";
import { refreshFinance, useCategories, useMoney, useToday } from "./use-finance";
import type { Budget, BudgetsResponse } from "./types";

type Draft = { id?: string; category: string; scope: "every" | "this"; limit: string };

export function BudgetsView() {
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, isLoading, error } = useApi<BudgetsResponse>(`/api/finance/budgets?month=${month}`);
  const { currency, fmt } = useMoney();
  const { data: cats } = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const expenseCats = [...DEFAULT_CATEGORIES.filter((c) => c.kind !== "income").map((c) => c.name), ...(cats?.custom.filter((c) => c.kind !== "income").map((c) => c.name) ?? [])];
  const progress = data?.progress ?? [];
  const overridden = new Set(progress.map((p) => p.id));
  const others = (data?.items ?? []).filter((b) => !overridden.has(b.id));

  const save = async () => {
    if (!draft) return;
    const limit = parseAmount(draft.limit, currency);
    if (limit === null || !amountInRange(limit)) return toast.error("Enter a monthly limit, like 15,000");
    setSaving(true);
    try {
      const payload = { category: draft.category, month: draft.scope === "every" ? EVERY_MONTH : month, limit };
      if (draft.id) await api.patch(`/api/finance/budgets/${draft.id}`, payload);
      else await api.post("/api/finance/budgets", payload);
      await refreshFinance();
      toast.success("Budget saved");
      setDraft(null);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: Budget) => {
    const name = b.category === ALL_CATEGORIES ? "overall" : b.category;
    if (!(await confirm({ title: `Remove the ${name} budget?`, body: b.month === EVERY_MONTH ? "It applies to every month." : `It applies to ${formatMonth(b.month)}.`, destructive: true, confirmLabel: "Remove budget" }))) return;
    try {
      await api.delete(`/api/finance/budgets/${b.id}`);
      await refreshFinance();
      toast.success("Budget removed");
    } catch (err) {
      toastError(err);
    }
  };

  const editBudget = (b: Budget) => setDraft({ id: b.id, category: b.category, scope: b.month === EVERY_MONTH ? "every" : "this", limit: toInputString(b.limit, currency) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[130px] text-center text-[15px] font-semibold" aria-live="polite">
            {formatMonth(month)}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {month !== today.slice(0, 7) && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
              This month
            </Button>
          )}
        </div>
        <Button onClick={() => setDraft({ category: progress.some((p) => p.category === ALL_CATEGORIES) ? expenseCats[0]! : ALL_CATEGORIES, scope: "every", limit: "" })}>
          <Plus className="h-4 w-4" /> New budget
        </Button>
      </div>

      {isLoading && !data ? (
        <Card className="space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : error && !data ? (
        <Card className="p-6 text-center text-sm text-fg-2" role="alert">
          Couldn&apos;t load budgets. {error.message}
        </Card>
      ) : !progress.length ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title="No budgets for this month"
            description="Set a monthly limit for all spending or for a category. You'll see a warning at 80% and when you go over."
            action={<Button onClick={() => setDraft({ category: ALL_CATEGORIES, scope: "every", limit: "" })}>Set a monthly budget</Button>}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {progress.map((b) => (
            <div key={b.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <BudgetBar b={b} />
                <div className="mt-1.5">
                  <Badge>{b.month === EVERY_MONTH ? "Every month" : `Only ${formatMonth(b.month)}`}</Badge>
                </div>
              </div>
              <Menu
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${b.category === ALL_CATEGORIES ? "overall" : b.category} budget`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
                items={[
                  { label: "Edit limit", icon: Pencil, onSelect: () => editBudget(b) },
                  { label: "Remove", icon: Trash2, danger: true, onSelect: () => void remove(b) },
                ]}
              />
            </div>
          ))}
        </Card>
      )}

      {others.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[13px] font-semibold text-fg-2">Other budgets (not active in {formatMonth(month)})</h3>
          <Card className="divide-y divide-line">
            {others.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-fg">{b.category === ALL_CATEGORIES ? "All spending" : b.category}</span>
                <span className="text-fg-2">{b.month === EVERY_MONTH ? "Every month (overridden this month)" : formatMonth(b.month)}</span>
                <span className="font-medium tabular-nums">{fmt(b.limit)}</span>
                <Button variant="ghost" size="icon-sm" aria-label="Edit budget" onClick={() => editBudget(b)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove budget" onClick={() => void remove(b)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <Dialog
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? "Edit budget" : "New budget"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save budget
            </Button>
          </>
        }
      >
        {draft && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="Applies to">
              <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                <option value={ALL_CATEGORIES}>All spending</option>
                {[...new Set(expenseCats)].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="When">
              <Select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as Draft["scope"] })}>
                <option value="every">Every month</option>
                <option value="this">Only {formatMonth(month)}</option>
              </Select>
            </Field>
            <Field label="Monthly limit" hint={`In ${currency}`}>
              <Input autoFocus inputMode="decimal" value={draft.limit} placeholder="e.g. 15,000" onChange={(e) => setDraft({ ...draft, limit: e.target.value })} />
            </Field>
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        )}
      </Dialog>
    </div>
  );
}
