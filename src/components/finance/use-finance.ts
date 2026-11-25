"use client";
import { useCallback, useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { useMe, useTz } from "@/lib/use-me";
import { dayKey } from "@/lib/time";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
import { presetRange } from "@/lib/finance";
import type { Account, CategoriesResponse, FinanceSettings, Filters, TxPage } from "./types";

// useSWRInfinite caches under "$inf$…" keys that refresh() can't match, so paged lists register here.
const pagedLists = new Set<() => Promise<unknown>>();

/** Revalidate everything Finance shows (and the cross-module summaries). */
export const refreshFinance = () => Promise.all([refresh("/api/finance", "/api/me", ...SUMMARY_KEYS), ...[...pagedLists].map((m) => m())]);

/** Cursor-paginated transactions for the given filters. */
export function useTxPages(query: string, opts: { limit?: number; scope?: "trash" } = {}) {
  const limit = opts.limit ?? 50;
  const getKey = (i: number, prev: TxPage | null) => {
    if (prev && !prev.nextCursor) return null;
    const p = new URLSearchParams(query);
    p.set("limit", String(limit));
    if (opts.scope) p.set("scope", opts.scope);
    if (i > 0 && prev?.nextCursor) p.set("cursor", prev.nextCursor);
    return `/api/finance/transactions?${p.toString()}`;
  };
  const res = useSWRInfinite<TxPage>(getKey, (u: string) => api.get<TxPage>(u), { revalidateFirstPage: true, revalidateOnFocus: true, keepPreviousData: true });
  const { mutate } = res;
  useEffect(() => {
    const m = () => mutate();
    pagedLists.add(m);
    return () => {
      pagedLists.delete(m);
    };
  }, [mutate]);
  const pages = res.data ?? [];
  const items = pages.flatMap((p) => p.items);
  const dayTotals = Object.assign({}, ...pages.map((p) => p.dayTotals)) as TxPage["dayTotals"];
  const last = pages[pages.length - 1];
  return {
    items,
    dayTotals,
    totals: pages[0]?.totals,
    hasMore: !!last?.nextCursor,
    loadMore: () => res.setSize(res.size + 1),
    loadingMore: res.isValidating && res.size > pages.length,
    isLoading: res.isLoading,
    error: res.error as Error | undefined,
    mutate,
  };
}

export function useFinanceSettings() {
  return useApi<FinanceSettings>("/api/finance/settings");
}

/** The user's currency and a formatter bound to it. */
export function useMoney() {
  const { data: me } = useMe();
  const { data } = useFinanceSettings();
  const currency = data?.currency ?? me?.settings.currency ?? DEFAULT_CURRENCY;
  const fmt = useCallback((minor: number, opts?: Parameters<typeof formatMoney>[2]) => formatMoney(minor, currency, opts), [currency]);
  return { currency, fmt };
}

export function useToday() {
  const tz = useTz();
  return dayKey(new Date(), tz);
}

export function useAccounts(all = false) {
  return useApi<{ items: Account[] }>(all ? "/api/finance/accounts?all=1" : "/api/finance/accounts");
}

export function useCategories() {
  return useApi<CategoriesResponse>("/api/finance/categories");
}

export function defaultFilters(today: string): Filters {
  return { ...presetRange("this_month", today), preset: "this_month", q: "", type: "", category: "", account: "", method: "", min: null, max: null, sort: "date_desc" };
}

/** Query string for the transaction list / export (without cursor). */
export function filterQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.preset !== "all") {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  }
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.type) p.set("type", f.type);
  if (f.category) p.set("category", f.category);
  if (f.account) p.set("account", f.account);
  if (f.method) p.set("method", f.method);
  if (f.min !== null) p.set("min", String(f.min));
  if (f.max !== null) p.set("max", String(f.max));
  if (f.sort !== "date_desc") p.set("sort", f.sort);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export function activeFilterCount(f: Filters) {
  return [f.type, f.category, f.account, f.method, f.min !== null ? "x" : "", f.max !== null ? "x" : ""].filter(Boolean).length;
}

/** Debounced value (search box). */
export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

/** matchMedia hook; false on the server and first paint. */
export function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
