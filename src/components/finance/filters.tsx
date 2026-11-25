"use client";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { parseAmount, toInputString } from "@/lib/money";
import { DEFAULT_CATEGORIES, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, TRANSFER_CATEGORY, formatRange, presetRange } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { activeFilterCount, useAccounts, useCategories, useDebounced, useMoney, useToday } from "./use-finance";
import type { Filters } from "./types";

export const PRESET_LABEL: Record<Filters["preset"], string> = {
  this_month: "This month",
  last_month: "Last month",
  last_30: "Last 30 days",
  this_year: "This year",
  all: "All time",
  custom: "Custom range",
};

/** Date range picker: presets + custom from/to. */
export function RangePicker({
  value,
  onChange,
  allowAll = true,
}: {
  value: Pick<Filters, "preset" | "from" | "to">;
  onChange: (v: Pick<Filters, "preset" | "from" | "to">) => void;
  allowAll?: boolean;
}) {
  const today = useToday();
  const presets = (Object.keys(PRESET_LABEL) as Filters["preset"][]).filter((p) => allowAll || p !== "all");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[150px]">
        <Select
          aria-label="Date range"
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as Filters["preset"];
            if (preset === "custom" || preset === "all") onChange({ preset, from: value.from, to: value.to });
            else onChange({ preset, ...presetRange(preset, today) });
          }}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
        </Select>
      </div>
      {value.preset === "custom" ? (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From date" className="w-[148px]" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="text-fg-3" aria-hidden>
            –
          </span>
          <Input type="date" aria-label="To date" className="w-[148px]" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </div>
      ) : value.preset !== "all" ? (
        <span className="text-[12.5px] text-fg-2">{formatRange(value.from, value.to)}</span>
      ) : null}
    </div>
  );
}

/** Search + range + filter popover + sort. Shared by the list and the sheet. */
export function FilterBar({ filters, onChange, showSort = true }: { filters: Filters; onChange: (f: Filters) => void; showSort?: boolean }) {
  const [q, setQ] = useState(filters.q);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (dq !== filters.q) onChange({ ...filters, q: dq });
  }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setQ(filters.q), [filters.q]);
  const count = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input type="search" aria-label="Search payee, note or tag" placeholder="Search payee, note, #tag" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <FilterPopover filters={filters} onChange={onChange} count={count} />
        {showSort && (
          <div className="w-[150px]">
            <Select aria-label="Sort" value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as Filters["sort"] })}>
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="amount_desc">Largest amount</option>
              <option value="amount_asc">Smallest amount</option>
            </Select>
          </div>
        )}
      </div>
      <RangePicker value={filters} onChange={(v) => onChange({ ...filters, ...v })} />
      {count > 0 && <ActiveChips filters={filters} onChange={onChange} />}
    </div>
  );
}

function ActiveChips({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const { fmt } = useMoney();
  const { data: acc } = useAccounts(true);
  const chips: { label: string; clear: Partial<Filters> }[] = [];
  if (filters.type) chips.push({ label: filters.type[0]!.toUpperCase() + filters.type.slice(1), clear: { type: "" } });
  if (filters.category) chips.push({ label: filters.category, clear: { category: "" } });
  if (filters.account) chips.push({ label: acc?.items.find((a) => a.id === filters.account)?.name ?? "Account", clear: { account: "" } });
  if (filters.method) chips.push({ label: PAYMENT_METHOD_LABEL[filters.method as keyof typeof PAYMENT_METHOD_LABEL] ?? filters.method, clear: { method: "" } });
  if (filters.min !== null) chips.push({ label: `≥ ${fmt(filters.min)}`, clear: { min: null } });
  if (filters.max !== null) chips.push({ label: `≤ ${fmt(filters.max)}`, clear: { max: null } });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onChange({ ...filters, ...c.clear })}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft px-2.5 text-[12px] font-medium text-primary hover:opacity-90"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ))}
      <button type="button" className="text-[12px] font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline" onClick={() => onChange({ ...filters, type: "", category: "", account: "", method: "", min: null, max: null })}>
        Clear all
      </button>
    </div>
  );
}

function FilterPopover({ filters, onChange, count }: { filters: Filters; onChange: (f: Filters) => void; count: number }) {
  const { currency } = useMoney();
  const { data: acc } = useAccounts(true);
  const { data: cats } = useCategories();
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMin(filters.min !== null ? toInputString(filters.min, currency) : "");
    setMax(filters.max !== null ? toInputString(filters.max, currency) : "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = [...DEFAULT_CATEGORIES.map((c) => c.name), ...(cats?.custom.map((c) => c.name) ?? []), TRANSFER_CATEGORY];
  const applyAmounts = () => {
    const mn = min.trim() ? parseAmount(min, currency) : null;
    const mx = max.trim() ? parseAmount(max, currency) : null;
    onChange({ ...filters, min: mn, max: mx });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="outline" aria-label={count ? `Filters, ${count} active` : "Filters"}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filters
          {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-[18px] text-on-primary">{count}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-[60] w-[min(340px,calc(100vw-24px))] rounded-xl border border-line bg-surface p-4 shadow-pop">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={filters.type} onChange={(e) => onChange({ ...filters, type: e.target.value as Filters["type"] })}>
                <option value="">All types</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </Select>
            </Field>
            <Field label="Paid with">
              <Select value={filters.method} onChange={(e) => onChange({ ...filters, method: e.target.value })}>
                <option value="">Any method</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
                <option value="none">Not set</option>
              </Select>
            </Field>
            <Field label="Category" className="col-span-2">
              <Select value={filters.category} onChange={(e) => onChange({ ...filters, category: e.target.value })}>
                <option value="">All categories</option>
                {[...new Set(categories)].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Account" className="col-span-2">
              <Select value={filters.account} onChange={(e) => onChange({ ...filters, account: e.target.value })}>
                <option value="">All accounts</option>
                {(acc?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.archivedAt ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Min amount">
              <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} onBlur={applyAmounts} onKeyDown={(e) => e.key === "Enter" && applyAmounts()} placeholder="0" />
            </Field>
            <Field label="Max amount">
              <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} onBlur={applyAmounts} onKeyDown={(e) => e.key === "Enter" && applyAmounts()} placeholder="Any" />
            </Field>
          </div>
          <div className={cn("mt-4 flex justify-between")}>
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...filters, type: "", category: "", account: "", method: "", min: null, max: null })}>
              Reset
            </Button>
            <Popover.Close asChild>
              <Button size="sm" onClick={applyAmounts}>
                Done
              </Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
