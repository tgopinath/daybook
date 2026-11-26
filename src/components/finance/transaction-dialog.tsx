"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { ACCEPT } from "@/lib/upload";
import { amountInRange, AMOUNT_LIMIT, currencySymbol, formatMoney, parseAmount, toInputString } from "@/lib/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, TRANSFER_CATEGORY, categoriesFor } from "@/lib/finance";
import { create } from "@/components/ui/store";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { MediaUploader, type Media } from "@/components/media/media";
import { cn } from "@/lib/utils";
import { categoryIcon } from "./meta";
import { deleteTx } from "./actions";
import { refreshFinance, useAccounts, useCategories, useMoney, useToday } from "./use-finance";
import type { Tx, TxType } from "./types";

type Init = { tx?: Tx; copy?: Tx; preset?: Partial<Pick<Tx, "type" | "date" | "accountId" | "category">> };
const store = create<{ open: boolean; init: Init }>({ open: false, init: {} });

/** Opens the add/edit transaction form (bottom sheet on phones). */
export function openTxDialog(init: Init = {}) {
  store.set({ open: true, init });
}
export const isTxDialogOpen = () => store.get().open;

type Draft = {
  type: TxType;
  amount: string;
  date: string;
  category: string;
  accountId: string;
  toAccountId: string;
  paymentMethod: string;
  payee: string;
  note: string;
  tags: string;
  receipt: Media | null;
};

const LAST_KEY = "mydiary-finance-last";
function lastUsed(): { accountId?: string; paymentMethod?: string } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function TransactionDialogHost() {
  const { open, init } = store.use();
  const { currency } = useMoney();
  const today = useToday();
  const { data: accountsData } = useAccounts(true);
  const { data: cats } = useCategories();
  const accounts = useMemo(() => accountsData?.items ?? [], [accountsData]);
  const editing = init.tx;

  const blank = (): Draft => {
    const last = lastUsed();
    const activeIds = accounts.filter((a) => !a.archivedAt).map((a) => a.id);
    const acc = init.preset?.accountId ?? (last.accountId && activeIds.includes(last.accountId) ? last.accountId : activeIds[0] ?? "");
    const type = init.preset?.type ?? "expense";
    return {
      type,
      amount: "",
      date: init.preset?.date ?? today,
      category: init.preset?.category ?? (type === "income" ? "Salary" : type === "transfer" ? TRANSFER_CATEGORY : "Food & dining"),
      accountId: acc,
      toAccountId: "",
      paymentMethod: type === "transfer" ? "" : last.paymentMethod ?? "upi",
      payee: "",
      note: "",
      tags: "",
      receipt: null,
    };
  };

  const fromTx = (t: Tx): Draft => ({
    type: t.type,
    amount: toInputString(t.amount, currency),
    date: t.date,
    category: t.category,
    accountId: t.accountId ?? "",
    toAccountId: t.toAccountId ?? "",
    paymentMethod: t.paymentMethod ?? "",
    payee: t.payee ?? "",
    note: t.note ?? "",
    tags: t.tags.join(", "),
    receipt: t.receipt,
  });

  const [d, setD] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState(false);
  const [tried, setTried] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setD(editing ? fromTx(editing) : init.copy ? { ...fromTx(init.copy), date: today, receipt: null } : blank());
    setTried(false);
    setCustom(false);
    // Focus the amount after the sheet animates in.
    const h = setTimeout(() => amountRef.current?.focus(), 60);
    return () => clearTimeout(h);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const close = () => store.set({ open: false });

  const minor = parseAmount(d.amount, currency);
  const amountError = !d.amount.trim()
    ? "Enter an amount"
    : minor === null
      ? "Enter a positive number, like 1,250.50"
      : !amountInRange(minor)
        ? `The most a single entry can hold is ${formatMoney(AMOUNT_LIMIT, currency)}`
        : null;
  const transferError =
    d.type === "transfer" ? (!d.accountId || !d.toAccountId ? "Choose both accounts" : d.accountId === d.toAccountId ? "Pick two different accounts" : null) : null;

  const categoryOptions = useMemo(() => {
    if (d.type === "transfer") return [];
    const base = categoriesFor(d.type);
    const extra = (cats?.custom ?? []).filter((c) => c.kind === "both" || c.kind === d.type).map((c) => c.name);
    const all = [...base, ...extra.filter((e) => !base.includes(e))];
    if (d.category && d.category !== TRANSFER_CATEGORY && !all.includes(d.category)) all.push(d.category);
    return all;
  }, [d.type, d.category, cats]);

  const changeType = (type: TxType) => {
    setD((p) => {
      const allowed = categoriesFor(type);
      const keep = type !== "transfer" && p.category !== TRANSFER_CATEGORY && (allowed.includes(p.category) || !categoriesFor(p.type).includes(p.category));
      return {
        ...p,
        type,
        category: type === "transfer" ? TRANSFER_CATEGORY : keep ? p.category : type === "income" ? "Salary" : "Food & dining",
        paymentMethod: type === "transfer" ? "" : p.paymentMethod || lastUsed().paymentMethod || "upi",
      };
    });
  };

  const save = async (another = false) => {
    setTried(true);
    if (amountError || transferError || minor === null) {
      amountRef.current?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      type: d.type,
      amount: minor,
      date: d.date || today,
      category: d.type === "transfer" ? TRANSFER_CATEGORY : d.category.trim() || "Other",
      accountId: d.accountId || null,
      toAccountId: d.type === "transfer" ? d.toAccountId || null : null,
      paymentMethod: d.type === "transfer" ? null : d.paymentMethod || null,
      payee: d.payee.trim() || null,
      note: d.note.trim() || null,
      tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
      receiptMediaId: d.receipt?.id ?? null,
    };
    try {
      if (editing) await api.patch(`/api/finance/transactions/${editing.id}`, payload);
      else await api.post("/api/finance/transactions", payload);
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ accountId: d.accountId || undefined, paymentMethod: d.paymentMethod || undefined }));
      } catch {
        /* storage blocked */
      }
      await refreshFinance();
      toast.success(editing ? "Transaction updated" : `${d.type === "income" ? "Income" : d.type === "transfer" ? "Transfer" : "Expense"} of ${formatMoney(minor, currency)} added`);
      if (another && !editing) {
        setD((p) => ({ ...p, amount: "", payee: "", note: "", tags: "", receipt: null }));
        setTried(false);
        amountRef.current?.focus();
      } else close();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const activeAccounts = accounts.filter((a) => !a.archivedAt || a.id === d.accountId || a.id === d.toAccountId);
  const symbol = currencySymbol(currency);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={editing ? "Edit transaction" : "Add transaction"}
      size="md"
      footer={
        <>
          {editing && (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:text-danger"
              onClick={() => {
                close();
                void deleteTx(editing);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {!editing && (
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => save(true)} disabled={saving}>
              Save &amp; add another
            </Button>
          )}
          <Button onClick={() => save(false)} loading={saving}>
            {editing ? "Save changes" : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save(false);
          }
        }}
      >
        <Segmented<TxType>
          value={d.type}
          onChange={changeType}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfer" },
          ]}
        />

        <div>
          <label htmlFor="tx-amount" className="text-[13px] font-medium text-fg-2">
            Amount
          </label>
          <div
            className={cn(
              "mt-1.5 flex items-baseline gap-2 rounded-[14px] border bg-surface px-4 py-2 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15",
              tried && amountError ? "border-danger" : "border-line",
            )}
          >
            <span className="font-display text-[26px] text-fg-2" aria-hidden>
              {symbol}
            </span>
            <input
              id="tx-amount"
              ref={amountRef}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0"
              value={d.amount}
              onChange={(e) => set("amount", e.target.value)}
              aria-invalid={tried && !!amountError}
              aria-describedby="tx-amount-msg"
              className="min-w-0 flex-1 bg-transparent font-display text-[34px] leading-tight font-semibold text-fg tabular-nums outline-none placeholder:text-fg-3"
            />
          </div>
          <p id="tx-amount-msg" className={cn("mt-1 text-xs", tried && amountError ? "text-danger" : "text-fg-3")}>
            {tried && amountError ? amountError : minor !== null && !amountError ? formatMoney(minor, currency) : `In ${currency}`}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={d.date} max="9999-12-31" onChange={(e) => set("date", e.target.value)} required />
          </Field>
          {d.type !== "transfer" ? (
            <Field label="Account">
              <Select value={d.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">No account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.archivedAt ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>

        {d.type === "transfer" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="From account" error={tried && transferError ? transferError : undefined}>
              <Select value={d.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">Choose…</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To account">
              <Select value={d.toAccountId} onChange={(e) => set("toAccountId", e.target.value)}>
                <option value="">Choose…</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {accounts.length < 2 && <p className="text-xs text-fg-2 sm:col-span-2">Add at least two accounts (Overview → Accounts) to record a transfer.</p>}
          </div>
        )}

        {d.type !== "transfer" && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {categoryOptions.map((c) => {
                const Icon = categoryIcon(c);
                const on = d.category === c && !custom;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCustom(false);
                      set("category", c);
                    }}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors",
                      on ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {c}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={custom}
                onClick={() => {
                  setCustom(true);
                  set("category", "");
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-2.5 text-[12.5px] font-medium",
                  custom ? "border-primary text-primary" : "border-line-strong text-fg-2 hover:text-fg",
                )}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Custom
              </button>
            </div>
            {custom && (
              <Input className="mt-2" autoFocus maxLength={40} placeholder="Category name, e.g. Pets" value={d.category} onChange={(e) => set("category", e.target.value)} aria-label="Custom category name" />
            )}
          </fieldset>
        )}

        {d.type !== "transfer" && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Paid with</legend>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((m) => {
                const on = d.paymentMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("paymentMethod", on ? "" : m)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                      on ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {PAYMENT_METHOD_LABEL[m]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <Field label={d.type === "income" ? "From (payer)" : d.type === "transfer" ? "Description" : "Paid to (payee)"}>
          <Input value={d.payee} maxLength={120} onChange={(e) => set("payee", e.target.value)} placeholder={d.type === "income" ? "e.g. Acme Corp" : d.type === "transfer" ? "e.g. Card bill" : "e.g. Blue Tokai"} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Note">
            <Textarea value={d.note} maxLength={1000} onChange={(e) => set("note", e.target.value)} className="min-h-[38px]" rows={1} placeholder="Optional" />
          </Field>
          <Field label="Tags" hint="Separate with commas">
            <Input value={d.tags} onChange={(e) => set("tags", e.target.value)} placeholder="trip, work" />
          </Field>
        </div>

        <div>
          <span className="text-[13px] font-medium text-fg-2">Receipt</span>
          <div className="mt-1.5">
            {d.receipt ? (
              <div className="flex items-center gap-3 rounded-[10px] border border-line p-2">
                {d.receipt.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.receipt.url} alt="Receipt" className="h-12 w-12 rounded-md object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-md bg-surface-2 text-fg-2">
                    <FileText className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <a href={d.receipt.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[14px] text-fg underline-offset-2 hover:underline">
                  {d.receipt.originalName ?? "Receipt"}
                </a>
                <Button variant="ghost" size="icon-sm" aria-label="Remove receipt" onClick={() => set("receipt", null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <MediaUploader variant="button" multiple={false} accept={ACCEPT.documents} label="Attach photo or PDF" onUploaded={(m) => set("receipt", m)} />
            )}
          </div>
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
