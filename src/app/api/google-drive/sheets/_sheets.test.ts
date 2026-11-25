import { describe, expect, it, vi } from "vitest";
import { SHEETS_SCOPE, SheetsError, buildWorkbook, createSpreadsheet, exchangeSheetsCode, safeSheetsReturn, sheetsAuthorizationUrl, sheetsError } from "./_sheets";

const txs = [
  { date: "2026-11-02", type: "expense", category: "Groceries", payee: "=cmd", accountId: "a", toAccountId: null, paymentMethod: "upi", amount: 125050, note: null, tags: [] },
  { date: "2026-11-03", type: "income", category: "Salary", payee: "Acme", accountId: "a", toAccountId: null, paymentMethod: null, amount: 5000000, note: null, tags: ["work"] },
];
const names = new Map([["a", "HDFC"]]);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("oauth", () => {
  it("asks for drive.file only, with PKCE", () => {
    const url = new URL(sheetsAuthorizationUrl({ state: "s", challenge: "c" }, "cid", "https://x/api/google-drive/sheets/callback"));
    expect(url.searchParams.get("scope")).toBe(SHEETS_SCOPE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x/api/google-drive/sheets/callback");
  });
  it("only returns to app pages", () => {
    expect(safeSheetsReturn("/finance?view=sheet")).toBe("/finance?view=sheet");
    for (const bad of ["//evil.com", "https://evil.com", "/api/x", null]) expect(safeSheetsReturn(bad)).toBe("/finance");
  });
  it("rejects a token without the scope", async () => {
    const f = vi.fn(async () => json(200, { access_token: "t", expires_in: 3600, scope: "openid" }));
    await expect(exchangeSheetsCode("c", "v", "r", { clientId: "a", clientSecret: "b" }, f as unknown as typeof fetch)).rejects.toMatchObject({ status: 403 });
  });
});

describe("workbook", () => {
  it("has header, rows, totals and net; category summary", () => {
    const wb = buildWorkbook(txs, names, "INR", { from: "2026-11-01", to: "2026-11-30" });
    expect(wb.title).toBe("MyDiary — Transactions 1 Nov – 30 Nov 2026");
    expect(wb.transactions[0]![7]).toBe("Income (INR)");
    expect(wb.transactions[1]!.slice(0, 9)).toEqual(["2026-11-02", "Expense", "Groceries", "=cmd", "HDFC", "", "UPI", null, 1250.5]);
    expect(wb.transactions.at(-2)!.slice(7, 10)).toEqual([50000, 1250.5, 0]);
    expect(wb.transactions.at(-1)![7]).toBe(48749.5);
    expect(wb.summary.at(-1)).toEqual(["Total", 1250.5, 50000, 2]);
  });
});

describe("api", () => {
  it("creates, fills (RAW) and formats", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      if (url.endsWith("/spreadsheets")) return json(200, { spreadsheetId: "abc", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit" });
      return json(200, {});
    });
    const out = await createSpreadsheet("tok", buildWorkbook(txs, names, "INR", {}), f as unknown as typeof fetch);
    expect(out).toEqual({ id: "abc", url: "https://docs.google.com/spreadsheets/d/abc/edit" });
    expect(calls[0]!.body).toMatchObject({ properties: { title: "MyDiary — Transactions all time" } });
    expect(calls[1]!.url).toContain("/abc/values:batchUpdate");
    expect(calls[1]!.body.valueInputOption).toBe("RAW");
    expect(calls[2]!.url).toContain("/abc:batchUpdate");
  });
  it("maps an expired token to reconnect", async () => {
    const f = vi.fn(async () => json(401, { error: { message: "Invalid Credentials", status: "UNAUTHENTICATED" } }));
    const err = await createSpreadsheet("tok", buildWorkbook(txs, names, "INR", {}), f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(SheetsError);
    expect(err.reconnect).toBe(true);
  });
  it("explains a disabled API", () => {
    const e = sheetsError(403, { error: { message: "Google Sheets API has not been used in project 1 before or it is disabled.", status: "PERMISSION_DENIED" } });
    expect(e.status).toBe(503);
    expect(e.reconnect).toBe(false);
  });
});
