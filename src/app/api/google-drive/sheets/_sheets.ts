import "server-only";
import { createHash, randomBytes } from "crypto";
import { EXPORT_HEADER, categorySummaryRows, exportRows, formatRange, totalsOf, type ExportTx } from "@/lib/finance";
import { minorDigits, toMajor } from "@/lib/money";

// Finance → Google Sheets export. Scope: drive.file only (files this app creates), shared with
// My Storage through UserSettings.googleDriveTokenEnc/Expires. Pure helpers (no database) so the
// OAuth URL, token exchange and spreadsheet calls can be unit-tested with a mocked fetch.

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
export const GDS_CALLBACK_PATH = "/api/google-drive/sheets/callback";
export const GDS_COOKIE = "pad_gds_oauth";
export const GDS_COOKIE_PATH = "/api/google-drive/sheets";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Fetch = typeof fetch;
type Cfg = { clientId: string; clientSecret: string };

export class SheetsError extends Error {
  constructor(
    public status: number,
    message: string,
    public reconnect = false,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ OAuth

export function sheetsRedirectUri(req: { headers: Headers; nextUrl: URL }) {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return base + GDS_CALLBACK_PATH;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${GDS_CALLBACK_PATH}`;
}

/** Only same-app pages may be returned to after connecting. */
export function safeSheetsReturn(raw: string | null | undefined, fallback = "/finance") {
  const v = raw ?? "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/api/") || v.includes("\\") || v.length > 300) return fallback;
  return v;
}

export function newSheetsAttempt(userId: string, returnTo: string) {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(16).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    userId,
    returnTo,
  };
}
export type SheetsAttempt = ReturnType<typeof newSheetsAttempt>;

export function sheetsAuthorizationUrl(a: Pick<SheetsAttempt, "state" | "challenge">, clientId: string, redirect: string, email?: string) {
  const url = new URL(AUTH_URL);
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SHEETS_SCOPE,
    include_granted_scopes: "true",
    access_type: "online",
    state: a.state,
    code_challenge: a.challenge,
    code_challenge_method: "S256",
  };
  if (email) params.login_hint = email;
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

export async function exchangeSheetsCode(code: string, verifier: string, redirect: string, cfg: Cfg, f: Fetch = fetch) {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new SheetsError(502, json.error_description || json.error || "Google didn't return an access token");
  if (json.scope && !json.scope.split(/\s+/).includes(SHEETS_SCOPE)) throw new SheetsError(403, "Access to create Google Sheets wasn't granted");
  const expiresIn = Math.max(120, Number(json.expires_in) || 3600);
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000) };
}

// ------------------------------------------------------------------ Sheets API

export function sheetsError(status: number, json: unknown) {
  const err = (json as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } | string })?.error;
  const message = typeof err === "string" ? err : err?.message;
  const detail = `${message ?? ""} ${typeof err === "object" ? `${err?.status ?? ""} ${err?.errors?.[0]?.reason ?? ""}` : ""}`;
  if (status === 401) return new SheetsError(401, "Your Google connection expired. Connect again to export.", true);
  if (status === 403 && /not been used|disabled|SERVICE_DISABLED|accessNotConfigured/i.test(detail)) return new SheetsError(503, "The Google Sheets API isn't enabled for this app yet.");
  if (status === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(detail)) return new SheetsError(401, "Google Sheets access wasn't granted. Connect again to export.", true);
  if (status === 429 || /rate|quota/i.test(detail)) return new SheetsError(429, "Google Sheets is busy right now. Wait a moment and try again.");
  return new SheetsError(status >= 500 ? 502 : status, message ? `Google Sheets: ${message}` : `Google Sheets request failed (${status})`);
}

async function call<T>(token: string, url: string, payload: unknown, f: Fetch): Promise<T> {
  const res = await f(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw sheetsError(res.status, json);
  return json as T;
}

const TX_SHEET = "Transactions";
const SUMMARY_SHEET = "Summary by category";

export type Workbook = {
  title: string;
  transactions: (string | number | null)[][];
  summary: (string | number)[][];
  digits: number;
  rowCount: number;
};

/** Builds the two sheets: transactions (+ totals and net rows) and the category summary. */
export function buildWorkbook(txs: ExportTx[], accountNames: Map<string, string>, currency: string, range: { from?: string; to?: string }): Workbook {
  const label = range.from && range.to ? formatRange(range.from, range.to) : range.from ? `from ${range.from}` : range.to ? `until ${range.to}` : "all time";
  const body = exportRows(txs, accountNames, (m) => toMajor(m, currency));
  const t = totalsOf(txs);
  const blank = EXPORT_HEADER.map(() => null as string | number | null);
  const totals = [...blank];
  totals[0] = "Total";
  totals[7] = toMajor(t.income, currency);
  totals[8] = toMajor(t.expense, currency);
  totals[9] = toMajor(t.transfer, currency);
  const net = [...blank];
  net[0] = "Net (income − expense)";
  net[7] = toMajor(t.net, currency);
  return {
    title: `My Diary — Transactions ${label}`,
    transactions: [EXPORT_HEADER.map((h, i) => (i >= 7 && i <= 9 ? `${h} (${currency})` : h)), ...body, totals, net],
    summary: [["Category", `Expense (${currency})`, `Income (${currency})`, "Transactions"], ...categorySummaryRows(txs, currency)],
    digits: minorDigits(currency),
    rowCount: txs.length,
  };
}

/**
 * Creates the spreadsheet: POST /v4/spreadsheets → values:batchUpdate (RAW, so text that looks like a
 * formula stays text) → light formatting (bold header/totals, number format; failures are ignored).
 */
export async function createSpreadsheet(token: string, wb: Workbook, f: Fetch = fetch) {
  const created = await call<{ spreadsheetId: string; spreadsheetUrl: string }>(
    token,
    SHEETS_API,
    {
      properties: { title: wb.title },
      sheets: [
        { properties: { sheetId: 0, title: TX_SHEET, gridProperties: { frozenRowCount: 1 } } },
        { properties: { sheetId: 1, title: SUMMARY_SHEET, gridProperties: { frozenRowCount: 1 } } },
      ],
    },
    f,
  );
  const id = created.spreadsheetId;
  if (!id) throw new SheetsError(502, "Google Sheets didn't return a spreadsheet id");
  await call(
    token,
    `${SHEETS_API}/${encodeURIComponent(id)}/values:batchUpdate`,
    {
      valueInputOption: "RAW",
      data: [
        { range: `'${TX_SHEET}'!A1`, values: wb.transactions.map((r) => r.map((c) => c ?? "")) },
        { range: `'${SUMMARY_SHEET}'!A1`, values: wb.summary },
      ],
    },
    f,
  );
  const pattern = wb.digits > 0 ? `#,##0.${"0".repeat(wb.digits)}` : "#,##0";
  const n = wb.transactions.length;
  const bold = (sheetId: number, startRowIndex: number, endRowIndex: number) => ({
    repeatCell: { range: { sheetId, startRowIndex, endRowIndex }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" },
  });
  const money = (sheetId: number, startColumnIndex: number, endColumnIndex: number) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex, endColumnIndex },
      cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });
  try {
    await call(
      token,
      `${SHEETS_API}/${encodeURIComponent(id)}:batchUpdate`,
      {
        requests: [
          bold(0, 0, 1),
          bold(0, n - 2, n),
          bold(1, 0, 1),
          bold(1, wb.summary.length - 1, wb.summary.length),
          money(0, 7, 10),
          money(1, 1, 3),
          { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: EXPORT_HEADER.length } } },
          { autoResizeDimensions: { dimensions: { sheetId: 1, dimension: "COLUMNS", startIndex: 0, endIndex: 4 } } },
        ],
      },
      f,
    );
  } catch (err) {
    console.warn("[sheets] formatting skipped", err instanceof Error ? err.message : err);
  }
  return { id, url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}/edit` };
}
