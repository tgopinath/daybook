import { describe, expect, it } from "vitest";
import {
  budgetProgress, budgetState, categorySummaryRows, computeBalances, effectiveBudgets, monthRange, normalizeTags,
  presetRange, summarize, toCsv, totalsOf, weekStartOf, type SummaryTx,
} from "./finance";

const tx = (p: Partial<SummaryTx>): SummaryTx => ({ type: "expense", amount: 100, accountId: "a", toAccountId: null, date: "2026-11-10", category: "Other", paymentMethod: null, ...p });

describe("balances", () => {
  it("opening + income − expense ± transfers", () => {
    const accounts = [{ id: "a", openingBalance: 10000 }, { id: "b", openingBalance: 500 }];
    const bal = computeBalances(accounts, [
      tx({ type: "income", amount: 5000, accountId: "a" }),
      tx({ type: "expense", amount: 1200, accountId: "a" }),
      tx({ type: "transfer", amount: 3000, accountId: "a", toAccountId: "b" }),
      tx({ type: "expense", amount: 200, accountId: "b" }),
      tx({ type: "expense", amount: 999, accountId: null }), // no account: ignored
      tx({ type: "expense", amount: 999, accountId: "gone" }), // unknown account: ignored
    ]);
    expect(bal.get("a")).toBe(10000 + 5000 - 1200 - 3000);
    expect(bal.get("b")).toBe(500 + 3000 - 200);
  });
});

describe("summaries", () => {
  const rows = [
    tx({ type: "income", amount: 50000, date: "2026-11-02", category: "Salary", paymentMethod: "netbanking" }),
    tx({ type: "expense", amount: 300, date: "2026-11-02", category: "Food & dining", paymentMethod: "upi" }),
    tx({ type: "expense", amount: 700, date: "2026-11-09", category: "Groceries", paymentMethod: "upi" }),
    tx({ type: "expense", amount: 200, date: "2026-11-09", category: "Food & dining", paymentMethod: "cash" }),
    tx({ type: "transfer", amount: 1000, date: "2026-11-09", accountId: "a", toAccountId: "b", category: "Transfer" }),
  ];
  it("totals ignore transfers for income/expense", () => {
    expect(totalsOf(rows)).toEqual({ income: 50000, expense: 1200, transfer: 1000, net: 48800, count: 5 });
  });
  it("groups by day with empty days filled", () => {
    const g = summarize(rows.filter((r) => r.date <= "2026-11-03"), "day", { from: "2026-11-01", to: "2026-11-03" });
    expect(g.map((x) => x.key)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(g[1]).toMatchObject({ income: 50000, expense: 300, net: 49700, count: 2 });
  });
  it("respects weekStart for weekly groups", () => {
    // 2026-11-09 is a Monday, 2026-11-08 a Sunday.
    expect(weekStartOf("2026-11-09", 1)).toBe("2026-11-09");
    expect(weekStartOf("2026-11-08", 1)).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08", 0)).toBe("2026-11-08");
    expect(weekStartOf("2026-11-14", 0)).toBe("2026-11-08");
    const mon = summarize(rows, "week", { weekStart: 1 });
    expect(mon.map((g) => [g.key, g.expense])).toEqual([["2026-11-02", 300], ["2026-11-09", 900]]);
    const sun = summarize(rows, "week", { weekStart: 0 });
    expect(sun.map((g) => [g.key, g.expense])).toEqual([["2026-11-01", 300], ["2026-11-08", 900]]);
  });
  it("groups by month, category, method and account", () => {
    expect(summarize(rows, "month")).toEqual([{ key: "2026-11", income: 50000, expense: 1200, transfer: 1000, net: 48800, count: 5 }]);
    const cat = summarize(rows, "category");
    expect(cat[0]).toMatchObject({ key: "Groceries", expense: 700 });
    expect(cat.find((c) => c.key === "Food & dining")?.expense).toBe(500);
    const method = summarize(rows, "method");
    expect(method.find((m) => m.key === "upi")?.expense).toBe(1000);
    const acc = summarize(rows, "account");
    expect(acc.find((a) => a.key === "a")?.net).toBe(50000 - 1200 - 1000);
    expect(acc.find((a) => a.key === "b")?.net).toBe(1000);
  });
});

describe("budgets", () => {
  it("states: under 80% ok, 80–100% warn, over", () => {
    expect(budgetState(79, 100)).toBe("ok");
    expect(budgetState(80, 100)).toBe("warn");
    expect(budgetState(100, 100)).toBe("warn");
    expect(budgetState(101, 100)).toBe("over");
  });
  it("month-specific budgets override every-month ones", () => {
    const budgets = [
      { id: "1", category: "*", month: "*", limit: 1000 },
      { id: "2", category: "*", month: "2026-11", limit: 2000 },
      { id: "3", category: "Groceries", month: "*", limit: 500 },
      { id: "4", category: "Travel", month: "2026-10", limit: 900 },
    ];
    expect(effectiveBudgets(budgets, "2026-11").map((b) => b.id)).toEqual(["2", "3"]);
    expect(effectiveBudgets(budgets, "2026-10").map((b) => b.id)).toEqual(["1", "3", "4"]);
    const p = budgetProgress(budgets, "2026-11", new Map([["Groceries", 450], ["Food & dining", 1700]]));
    expect(p[0]).toMatchObject({ category: "*", spent: 2150, state: "over", remaining: -150 });
    expect(p[1]).toMatchObject({ category: "Groceries", spent: 450, state: "warn", percent: 90 });
  });
});

describe("dates", () => {
  it("presets", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("this_year", "2026-11-25")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("export", () => {
  const names = new Map([["a", "HDFC"], ["b", "Wallet"]]);
  const rows = [
    { date: "2026-11-02", type: "expense", category: "Food & dining", payee: '=HYPERLINK("x")', accountId: "a", toAccountId: null, paymentMethod: "upi", amount: 125050, note: "dinner, friends", tags: ["fun", "weekend"] },
    { date: "2026-11-03", type: "transfer", category: "Transfer", payee: null, accountId: "a", toAccountId: "b", paymentMethod: null, amount: 5000, note: null, tags: [] },
    { date: "2026-11-04", type: "income", category: "Salary", payee: "Acme", accountId: "a", toAccountId: null, paymentMethod: "netbanking", amount: 9000000, note: null, tags: [] },
  ];
  it("builds a safe CSV", () => {
    const csv = toCsv(rows, names, "INR");
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Category,Payee,Account,To account,Payment method,Income,Expense,Transfer,Note,Tags");
    expect(lines[1]).toBe(`2026-11-02,Expense,Food & dining,"'=HYPERLINK(""x"")",HDFC,,UPI,,1250.50,,"dinner, friends","fun, weekend"`);
    expect(lines[2]).toBe("2026-11-03,Transfer,Transfer,,HDFC,Wallet,,,,50.00,,");
    expect(lines[3]).toBe("2026-11-04,Income,Salary,Acme,HDFC,,Net banking,90000.00,,,,");
  });
  it("summarises by category without transfers", () => {
    expect(categorySummaryRows(rows, "INR")).toEqual([
      ["Food & dining", 1250.5, 0, 1],
      ["Salary", 0, 90000, 1],
      ["Total", 1250.5, 90000, 2],
    ]);
  });
  it("normalises tags", () => {
    expect(normalizeTags([" #Food ", "food", "Trip"])).toEqual(["food", "trip"]);
  });
});
