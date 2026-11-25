"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Plus, Settings2, Wallet } from "lucide-react";
import { useApi } from "@/lib/client";
import { ACCOUNT_TYPE_LABEL, ALL_CATEGORIES, formatDay, formatMonth, formatRange, type AccountType } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { ChartCard, ChartCardSkeleton, ChartTooltip, axisProps, useChartColors } from "@/components/dashboard/chart-kit";
import { cn } from "@/lib/utils";
import { accountIcon, categoricalFills, categoryIcon } from "./meta";
import { RangePicker } from "./filters";
import { openTxDialog } from "./transaction-dialog";
import { openAccounts } from "./accounts-dialog";
import { useMoney } from "./use-finance";
import type { BudgetProgress, Filters, Overview as OverviewData } from "./types";

type Range = Pick<Filters, "preset" | "from" | "to">;

function useSecondary() {
  const [c, setC] = useState("#999900");
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--secondary").trim();
    if (v) setC(v);
  }, []);
  return c;
}

export function OverviewView({ range, onRange, onShowBudgets }: { range: Range; onRange: (r: Range) => void; onShowBudgets: () => void }) {
  const { fmt } = useMoney();
  const q = range.preset === "all" ? "" : `?from=${range.from}&to=${range.to}`;
  const { data, error, isLoading } = useApi<OverviewData>(`/api/finance/overview${q}`);
  const colors = useChartColors();
  const secondary = useSecondary();
  const fills = categoricalFills(colors, secondary);
  const [barMode, setBarMode] = useState<"daily" | "weekly">("daily");
  const short = (v: number) => fmt(v, { compact: true });

  const hasDaily = (data?.daily.length ?? 0) > 0;
  const bars = useMemo(() => {
    if (!data) return [];
    const src = barMode === "daily" && hasDaily ? data.daily : data.weekly;
    return src.map((d) => ({
      label: barMode === "daily" && hasDaily ? String(Number(d.key.slice(8))) : formatDay(d.key),
      fullLabel: barMode === "daily" && hasDaily ? formatDay(d.key, { year: true }) : `Week of ${formatDay(d.key, { year: true })}`,
      Spent: d.expense,
    }));
  }, [data, barMode, hasDaily]);

  const donut = useMemo(() => {
    if (!data) return [];
    const top = data.byCategory.slice(0, 5);
    const rest = data.byCategory.slice(5).reduce((s, c) => s + c.amount, 0);
    const out = top.map((c) => ({ name: c.key, value: c.amount }));
    if (rest > 0) out.push({ name: "Everything else", value: rest });
    return out;
  }, [data]);

  const trend = useMemo(() => (data?.trend ?? []).map((m) => ({ label: formatMonth(m.key, true), fullLabel: formatMonth(m.key), Income: m.income, Expenses: m.expense })), [data]);

  if (error && !data)
    return (
      <Card className="p-6 text-center text-sm text-fg-2" role="alert">
        Couldn&apos;t load your overview. {error.message}
      </Card>
    );

  const t = data?.totals;
  const prev = data?.previous;
  const spendDelta = t && prev && prev.expense > 0 ? Math.round(((t.expense - prev.expense) / prev.expense) * 100) : null;
  const empty = data && t!.count === 0 && data.accounts.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <RangePicker value={range} onChange={onRange} allowAll={false} />

      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="h-8 w-32" />
            </Card>
          ))}
        </div>
      ) : t ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Income" value={fmt(t.income)} tone="success" icon={ArrowDownRight} />
          <Stat
            label="Expenses"
            value={fmt(t.expense)}
            tone="danger"
            icon={ArrowUpRight}
            hint={spendDelta === null ? undefined : spendDelta === 0 ? "Same as the previous period" : `${Math.abs(spendDelta)}% ${spendDelta > 0 ? "more" : "less"} than the previous period`}
          />
          <Stat label="Net" value={fmt(t.net, { sign: "always" })} tone={t.net >= 0 ? "success" : "danger"} hint={`${t.count} transaction${t.count === 1 ? "" : "s"} · ${formatRange(data!.from, data!.to)}`} />
        </div>
      ) : null}

      {empty ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Track where your money goes"
            description="Add your first expense, or set up the accounts you pay from — cash, bank, cards, wallets."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => openTxDialog()}>
                  <Plus className="h-4 w-4" /> Add your first expense
                </Button>
                <Button variant="outline" onClick={() => openAccounts()}>
                  Add accounts
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {isLoading && !data ? (
              <>
                <ChartCardSkeleton />
                <ChartCardSkeleton />
              </>
            ) : (
              data && (
                <>
                  <ChartCard title="Spending by category" subtitle={formatRange(data.from, data.to)} empty={!donut.length} emptyText="No expenses in this period" height={280}>
                    <div className="flex h-full flex-col items-center gap-4 sm:flex-row">
                      <div className="h-[120px] w-[120px] shrink-0 sm:h-[200px] sm:w-[200px]" aria-hidden>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={donut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke={colors.surface} strokeWidth={2} isAnimationActive={false}>
                              {donut.map((d, i) => (
                                <Cell key={d.name} fill={fills[i % fills.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip labelKey="name" format={(v) => fmt(v)} />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="w-full min-w-0 flex-1 space-y-1.5" aria-label="Spending by category">
                        {donut.map((d, i) => {
                          const Icon = categoryIcon(d.name);
                          const pct = t!.expense ? Math.round((d.value / t!.expense) * 100) : 0;
                          return (
                            <li key={d.name} className="flex items-center gap-2 text-[13px]">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: fills[i % fills.length] }} aria-hidden />
                              <Icon className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
                              <span className="text-[12px] text-fg-3 tabular-nums">{pct}%</span>
                              <span className="w-[92px] text-right font-medium text-fg tabular-nums">{fmt(d.value)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </ChartCard>

                  <ChartCard
                    title={barMode === "daily" && hasDaily ? "Daily spending" : "Weekly spending"}
                    subtitle={formatRange(data.from, data.to)}
                    empty={!t!.expense}
                    emptyText="No expenses in this period"
                    height={280}
                    action={
                      hasDaily ? (
                        <Segmented
                          size="sm"
                          value={barMode}
                          onChange={setBarMode}
                          options={[
                            { value: "daily", label: "Daily" },
                            { value: "weekly", label: "Weekly" },
                          ]}
                        />
                      ) : undefined
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bars} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={colors.border} />
                        <XAxis dataKey="label" {...axisProps(colors)} interval="preserveStartEnd" minTickGap={8} />
                        <YAxis {...axisProps(colors)} width={56} tickFormatter={short} />
                        <Tooltip cursor={{ fill: colors.surface2 }} content={<ChartTooltip format={(v) => fmt(v)} />} />
                        <Bar dataKey="Spent" fill={colors.danger} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </>
              )
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {data ? (
              <ChartCard className="lg:col-span-3" title="Month over month" subtitle="Income and expenses, last 6 months" empty={trend.every((m) => !m.Income && !m.Expenses)} height={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={colors.border} />
                    <XAxis dataKey="label" {...axisProps(colors)} />
                    <YAxis {...axisProps(colors)} width={56} tickFormatter={short} />
                    <Tooltip content={<ChartTooltip format={(v) => fmt(v)} />} />
                    <Line type="monotone" dataKey="Income" stroke={colors.success} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Expenses" stroke={colors.danger} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            ) : (
              <div className="lg:col-span-3">
                <ChartCardSkeleton />
              </div>
            )}
            <AccountsCard data={data} />
          </div>

          {data && <BudgetsCard budgets={data.budgets} month={data.budgetMonth} onManage={onShowBudgets} />}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint, icon: Icon }: { label: string; value: string; tone: "success" | "danger"; hint?: string; icon?: typeof ArrowUpRight }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
        {Icon && <Icon className={cn("h-3.5 w-3.5", tone === "success" ? "text-success" : "text-danger")} aria-hidden />}
        {label}
      </div>
      <div className={cn("mt-1 font-display text-[28px] leading-tight font-semibold tabular-nums", tone === "success" ? "text-success" : "text-danger")}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-fg-2">{hint}</div>}
    </Card>
  );
}

function AccountsCard({ data }: { data?: OverviewData }) {
  const { fmt } = useMoney();
  const accounts = data?.accounts ?? [];
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <Card className="flex flex-col p-4 md:p-5 lg:col-span-2">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold">Accounts</h3>
          <p className="mt-0.5 text-[12px] text-fg-2">Balance today</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => openAccounts()}>
          <Settings2 className="h-3.5 w-3.5" /> Manage
        </Button>
      </div>
      {!data ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line p-4 text-center">
          <p className="text-[13px] text-fg-2">Add the places your money lives to see balances.</p>
          <Button size="sm" variant="outline" onClick={() => openAccounts(true)}>
            <Plus className="h-3.5 w-3.5" /> Add account
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 font-display text-[24px] font-semibold tabular-nums">{fmt(total)}</div>
          <ul className="space-y-1">
            {accounts.map((a) => {
              const Icon = accountIcon(a.type);
              return (
                <li key={a.id} className="flex items-center gap-2.5 rounded-lg py-1.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2" aria-hidden>
                    <Icon className="h-4 w-4" style={{ color: a.color }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-fg">{a.name}</span>
                    <span className="block text-[11.5px] text-fg-3">{ACCOUNT_TYPE_LABEL[a.type as AccountType] ?? a.type}</span>
                  </span>
                  <span className={cn("text-[13.5px] font-semibold tabular-nums", a.balance < 0 ? "text-danger" : "text-fg")}>{fmt(a.balance)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

export const BUDGET_FILL = { ok: "var(--success)", warn: "var(--warning-fill)", over: "var(--danger)" } as const;

export function budgetLabel(b: Pick<BudgetProgress, "state" | "remaining" | "percent">, fmt: (m: number) => string) {
  if (b.state === "over") return { text: `Over by ${fmt(-b.remaining)}`, className: "text-danger" };
  if (b.state === "warn") return { text: `${b.percent}% used · ${fmt(b.remaining)} left`, className: "text-warning-text" };
  return { text: `${fmt(b.remaining)} left`, className: "text-success" };
}

export function BudgetBar({ b }: { b: BudgetProgress }) {
  const { fmt } = useMoney();
  const label = budgetLabel(b, fmt);
  const name = b.category === ALL_CATEGORIES ? "All spending" : b.category;
  const Icon = b.category === ALL_CATEGORIES ? Wallet : categoryIcon(b.category);
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[13px]">
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-fg">{name}</span>
        <span className="text-fg-2 tabular-nums">
          {fmt(b.spent)} <span className="text-fg-3">/ {fmt(b.limit)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${name} budget`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, b.percent)} aria-valuetext={label.text}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, b.percent)}%`, background: BUDGET_FILL[b.state] }} />
      </div>
      <div className={cn("mt-1 flex items-center gap-1 text-[12px] font-medium", label.className)}>
        {b.state !== "ok" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
        {label.text}
      </div>
    </div>
  );
}

function BudgetsCard({ budgets, month, onManage }: { budgets: BudgetProgress[]; month: string; onManage: () => void }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold">Budgets</h3>
          <p className="mt-0.5 text-[12px] text-fg-2">{formatMonth(month)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onManage}>
          {budgets.length ? "Manage" : "Set a budget"}
        </Button>
      </div>
      {budgets.length ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          {budgets.map((b) => (
            <BudgetBar key={b.id} b={b} />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-fg-2">Set a monthly limit to get a gentle nudge at 80% and when you go over.</p>
      )}
    </Card>
  );
}
