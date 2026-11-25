"use client";
import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { AMOUNT_LIMIT, parseAmount, toInputString } from "@/lib/money";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL } from "@/lib/finance";
import { create } from "@/components/ui/store";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Badge, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ACCOUNT_COLORS, accountIcon } from "./meta";
import { refreshFinance, useAccounts, useMoney } from "./use-finance";
import type { Account } from "./types";

const store = create<{ open: boolean; adding: boolean }>({ open: false, adding: false });
export function openAccounts(adding = false) {
  store.set({ open: true, adding });
}

type Draft = { id?: string; name: string; type: string; opening: string; color: string };

export function AccountsDialogHost() {
  const { open, adding } = store.use();
  const { data, isLoading } = useAccounts(true);
  const { currency, fmt } = useMoney();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const accounts = data?.items ?? [];

  useEffect(() => {
    if (open) setDraft(adding ? { name: "", type: "bank", opening: "", color: ACCOUNT_COLORS[0]! } : null);
  }, [open, adding]);

  const edit = (a: Account) => setDraft({ id: a.id, name: a.name, type: a.type, opening: a.openingBalance ? toInputString(a.openingBalance, currency) : "", color: a.color });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Name the account");
    const opening = draft.opening.trim() ? parseAmount(draft.opening, currency, { allowNegative: true, allowZero: true }) : 0;
    if (opening === null || Math.abs(opening) > AMOUNT_LIMIT) return toast.error("Enter the opening balance as a number, like 25,000");
    setSaving(true);
    try {
      const payload = { name: draft.name.trim(), type: draft.type, openingBalance: opening, color: draft.color };
      if (draft.id) await api.patch(`/api/finance/accounts/${draft.id}`, payload);
      else await api.post("/api/finance/accounts", payload);
      await refreshFinance();
      toast.success(draft.id ? "Account updated" : "Account added");
      setDraft(null);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const archive = async (a: Account, archived: boolean) => {
    try {
      await api.patch(`/api/finance/accounts/${a.id}`, { archived });
      await refreshFinance();
      toast.success(archived ? `${a.name} archived — its history stays` : `${a.name} is active again`);
    } catch (err) {
      toastError(err);
    }
  };

  const remove = async (a: Account) => {
    if (a.txCount > 0) return toast.error("This account has transactions. Archive it instead to keep its history.");
    if (!(await confirm({ title: `Delete ${a.name}?`, body: "This account has no transactions. It will be removed permanently.", destructive: true, confirmLabel: "Delete account" }))) return;
    try {
      await api.delete(`/api/finance/accounts/${a.id}`);
      await refreshFinance();
      toast.success("Account deleted");
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => store.set({ open: o })}
      title="Accounts"
      description="Cash, bank accounts, cards, wallets and savings. Balances = opening balance + income − expenses ± transfers."
      size="md"
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {draft.id ? "Save account" : "Add account"}
            </Button>
          </>
        ) : (
          <Button onClick={() => setDraft({ name: "", type: "bank", opening: "", color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]! })}>
            <Plus className="h-4 w-4" /> New account
          </Button>
        )
      }
    >
      {draft ? (
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Name" className="sm:col-span-2">
            <Input autoFocus value={draft.name} maxLength={60} placeholder="e.g. HDFC Savings" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opening balance" hint={`In ${currency}. Use a minus for card dues.`}>
            <Input inputMode="decimal" value={draft.opening} placeholder="0" onChange={(e) => setDraft({ ...draft, opening: e.target.value })} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${i + 1}`}
                  aria-pressed={draft.color === c}
                  onClick={() => setDraft({ ...draft, color: c })}
                  className={cn("h-7 w-7 rounded-full border-2 transition-transform", draft.color === c ? "scale-110 border-fg" : "border-transparent")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      ) : isLoading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : accounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-2">No accounts yet. Add your bank, cash or cards to track balances.</p>
      ) : (
        <ul className="divide-y divide-line">
          {accounts.map((a) => {
            const Icon = accountIcon(a.type);
            return (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2" aria-hidden>
                  <Icon className="h-4 w-4" style={{ color: a.color }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-fg">{a.name}</span>
                    {a.archivedAt && <Badge>Archived</Badge>}
                  </span>
                  <span className="block text-[12px] text-fg-3">
                    {ACCOUNT_TYPE_LABEL[a.type as keyof typeof ACCOUNT_TYPE_LABEL] ?? a.type} · {a.txCount} transaction{a.txCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className={cn("text-[14px] font-semibold tabular-nums", a.balance < 0 ? "text-danger" : "text-fg")}>{fmt(a.balance)}</span>
                <Menu
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  }
                  items={[
                    { label: "Edit", icon: Pencil, onSelect: () => edit(a) },
                    a.archivedAt ? { label: "Unarchive", icon: ArchiveRestore, onSelect: () => void archive(a, false) } : { label: "Archive", icon: Archive, onSelect: () => void archive(a, true) },
                    { type: "separator" },
                    { label: "Delete", icon: Trash2, danger: true, disabled: a.txCount > 0, onSelect: () => void remove(a) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
