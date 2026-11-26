"use client";
import { useMemo } from "react";
import { ArrowRight, Copy, MoreHorizontal, Paperclip, Pencil, SearchX, Trash2, Wallet } from "lucide-react";
import { PAYMENT_METHOD_LABEL, formatDay, type PaymentMethod } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Card, DemoBadge, EmptyState, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { categoryIcon } from "./meta";
import { deleteTx } from "./actions";
import { openTxDialog } from "./transaction-dialog";
import { activeFilterCount, useAccounts, useMoney, useToday, useTxPages } from "./use-finance";
import type { Account, Filters, Tx } from "./types";

export function amountClass(type: string) {
  return type === "income" ? "text-success" : type === "expense" ? "text-danger" : "text-fg-2";
}

export function signedAmount(fmt: (m: number, o?: { sign?: "always" | "never" }) => string, t: Pick<Tx, "type" | "amount">) {
  if (t.type === "income") return `+${fmt(t.amount)}`;
  if (t.type === "expense") return `−${fmt(t.amount)}`;
  return fmt(t.amount);
}

function dayLabel(day: string, today: string, yesterday: string) {
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd}, ${formatDay(day, { year: day.slice(0, 4) !== today.slice(0, 4) })}`;
}

export function TransactionsList({ filters, query, onClearFilters }: { filters: Filters; query: string; onClearFilters: () => void }) {
  const { fmt } = useMoney();
  const today = useToday();
  const { items, dayTotals, totals, hasMore, loadMore, loadingMore, isLoading, error } = useTxPages(query);
  const { data: acc } = useAccounts(true);
  const accounts = useMemo(() => new Map((acc?.items ?? []).map((a) => [a.id, a])), [acc]);
  const yesterday = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10);
  }, [today]);

  const byDay = filters.sort.startsWith("date");
  const groups = useMemo(() => {
    if (!byDay) return [{ day: "", items }];
    const out: { day: string; items: Tx[] }[] = [];
    for (const t of items) {
      const last = out[out.length - 1];
      if (last && last.day === t.date) last.items.push(t);
      else out.push({ day: t.date, items: [t] });
    }
    return out;
  }, [items, byDay]);

  if (isLoading && !items.length)
    return (
      <Card className="p-4" aria-busy="true" aria-label="Loading transactions">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
    );

  if (error && !items.length)
    return (
      <Card className="p-6 text-center text-sm text-fg-2" role="alert">
        Couldn&apos;t load transactions. {error.message}
      </Card>
    );

  if (!items.length) {
    const filtered = activeFilterCount(filters) > 0 || !!filters.q.trim();
    return (
      <Card>
        {filtered ? (
          <EmptyState icon={SearchX} title="Nothing matches these filters" description="Try a wider date range or clear the filters." action={<Button variant="outline" onClick={onClearFilters}>Clear filters</Button>} />
        ) : (
          <EmptyState
            icon={Wallet}
            title="Track where your money goes"
            description="Add your first expense — a coffee, a bill, anything. It takes a few seconds."
            action={<Button onClick={() => openTxDialog()}>Add your first expense</Button>}
          />
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {totals && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[13px] text-fg-2" aria-live="polite">
          <span>
            {totals.count} transaction{totals.count === 1 ? "" : "s"}
          </span>
          <span>
            In <span className="font-medium text-success tabular-nums">{fmt(totals.income)}</span>
          </span>
          <span>
            Out <span className="font-medium text-danger tabular-nums">{fmt(totals.expense)}</span>
          </span>
          <span>
            Net <span className={cn("font-medium tabular-nums", totals.net >= 0 ? "text-success" : "text-danger")}>{fmt(totals.net, { sign: "always" })}</span>
          </span>
        </div>
      )}
      {groups.map((g) => {
        const dt = g.day ? dayTotals[g.day] : undefined;
        return (
          <section key={g.day || "all"} aria-label={g.day ? dayLabel(g.day, today, yesterday) : "Transactions"}>
            {g.day && (
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h3 className="text-[14px] font-semibold text-fg">{dayLabel(g.day, today, yesterday)}</h3>
                {dt && (
                  <span className="flex gap-3 text-[12px] text-fg-2 tabular-nums">
                    {dt.income > 0 && <span className="text-success">+{fmt(dt.income)}</span>}
                    {dt.expense > 0 && <span className="text-danger">−{fmt(dt.expense)}</span>}
                  </span>
                )}
              </div>
            )}
            <Card className="divide-y divide-line overflow-hidden">
              {g.items.map((t) => (
                <TxRow key={t.id} t={t} accounts={accounts} showDate={!g.day} />
              ))}
            </Card>
          </section>
        );
      })}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function TxRow({ t, accounts, showDate }: { t: Tx; accounts: Map<string, Account>; showDate: boolean }) {
  const { fmt } = useMoney();
  const Icon = categoryIcon(t.category);
  const from = t.accountId ? accounts.get(t.accountId)?.name : null;
  const to = t.toAccountId ? accounts.get(t.toAccountId)?.name : null;
  const meta = [
    showDate ? formatDay(t.date, { year: true }) : null,
    t.type !== "transfer" && t.payee ? t.category : null,
    t.type === "transfer" ? null : from,
    t.paymentMethod ? PAYMENT_METHOD_LABEL[t.paymentMethod as PaymentMethod] ?? t.paymentMethod : null,
  ].filter(Boolean);
  const title = t.type === "transfer" ? t.payee || "Transfer" : t.payee || t.category;
  return (
    <div className="group relative flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 sm:px-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", t.type === "income" ? "bg-success-soft text-success" : t.type === "expense" ? "bg-danger-soft text-danger" : "bg-surface-2 text-fg-2")}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <button type="button" onClick={() => openTxDialog({ tx: t })} className="min-w-0 flex-1 text-left after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-lg after:focus-visible:ring-2 after:focus-visible:ring-primary" aria-label={`Edit ${title}, ${signedAmount(fmt, t)}`}>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium text-fg">{title}</span>
          {t.receipt && <Paperclip className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-label="Has receipt" />}
          <DemoBadge show={t.isDemo} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-fg-3">
          {t.type === "transfer" && (
            <span className="inline-flex items-center gap-1">
              {from ?? "—"} <ArrowRight className="h-3 w-3" aria-label="to" /> {to ?? "—"}
            </span>
          )}
          {meta.map((m, i) => (
            <span key={i}>{(i > 0 || t.type === "transfer" ? "· " : "") + m}</span>
          ))}
          {t.tags.map((tag) => (
            <span key={tag} className="text-fg-2">
              #{tag}
            </span>
          ))}
        </span>
        {t.note && <span className="mt-0.5 block truncate text-[12px] text-fg-2">{t.note}</span>}
      </button>
      <span className={cn("relative shrink-0 text-[14px] font-semibold tabular-nums", amountClass(t.type))}>{signedAmount(fmt, t)}</span>
      <div className="relative">
        <Menu
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openTxDialog({ tx: t }) },
            { label: "Duplicate", icon: Copy, onSelect: () => openTxDialog({ copy: t }) },
            { type: "separator" },
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => void deleteTx(t) },
          ]}
        />
      </div>
    </div>
  );
}
