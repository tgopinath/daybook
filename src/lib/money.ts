// Money helpers shared by server and client. Amounts are always integers in
// minor units (paise, cents…) of the user's currency (UserSettings.currency).

export const DEFAULT_CURRENCY = "INR";

/** Largest amount accepted for a single transaction / budget, in minor units. */
export const MAX_AMOUNT = 1e12;
/**
 * The database column is a 32-bit integer, so the real ceiling is lower than
 * MAX_AMOUNT until the schema moves to BigInt. Validation uses the smaller one.
 */
export const DB_MAX_AMOUNT = 2_147_483_647;
export const AMOUNT_LIMIT = Math.min(MAX_AMOUNT, DB_MAX_AMOUNT);

/** Popular currencies first; the full ISO list comes from Intl when available. */
export const POPULAR_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF", "CNY", "SAR", "MYR", "NZD", "ZAR"];

export function allCurrencies(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
    if (list?.length) return list;
  } catch {
    /* older runtime */
  }
  return [...POPULAR_CURRENCIES].sort();
}

/** True for a well-formed ISO 4217 code this runtime knows how to format. */
export function isCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
    if (list?.length) return list.includes(code);
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

const digitsCache = new Map<string, number>();
/** Number of minor-unit digits for a currency (INR 2, JPY 0, BHD 3). */
export function minorDigits(currency: string): number {
  const hit = digitsCache.get(currency);
  if (hit !== undefined) return hit;
  let d = 2;
  try {
    d = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    d = 2;
  }
  digitsCache.set(currency, d);
  return d;
}

/** Locale used for formatting: Indian grouping for INR, otherwise the runtime default. */
export function localeFor(currency: string): string | undefined {
  return currency === "INR" ? "en-IN" : undefined;
}

export function currencySymbol(currency: string, locale = localeFor(currency)): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

export function currencyName(currency: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}

/** Minor units → major units as a JS number (for charts and spreadsheets). */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency);
}

/** Minor units → plain editable string without grouping ("1250.5" → "1250.50"). */
export function toInputString(minor: number, currency: string): string {
  const d = minorDigits(currency);
  const neg = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const s = String(abs).padStart(d + 1, "0");
  const out = d === 0 ? s : `${s.slice(0, -d)}.${s.slice(-d)}`;
  return neg ? `-${out}` : out;
}

/**
 * Parses user input ("1,250.50", "₹ 1250", "12.5") into minor units.
 * Returns null for anything that isn't a positive amount. Extra decimals are
 * rounded half-up. Commas are group separators, except "12,50"-style input
 * (a single comma followed by 1–2 digits and no dot), which is a decimal comma.
 */
export function parseAmount(input: string | number | null | undefined, currency: string, opts: { allowNegative?: boolean; allowZero?: boolean } = {}): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  let neg = false;
  if (/^[-−]/.test(s) || /^\(.*\)$/.test(s)) {
    neg = true;
    s = s.replace(/^[-−]/, "").replace(/^\((.*)\)$/, "$1");
  }
  // Drop currency symbols/codes and spaces.
  s = s.replace(/[A-Za-z]{3}/g, "").replace(/[^\d.,-]/g, "");
  if (/^-/.test(s)) {
    neg = true;
    s = s.slice(1);
  }
  if (!s || /-/.test(s)) return null;
  const commas = (s.match(/,/g) ?? []).length;
  if (!s.includes(".") && commas === 1 && /,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "." || s === "") return null;
  const [intPart = "", fracPart = ""] = s.split(".");
  const d = minorDigits(currency);
  let frac = fracPart.slice(0, d).padEnd(d, "0");
  let int = BigInt(intPart || "0");
  let fracNum = d ? BigInt(frac) : 0n;
  if (fracPart.length > d && Number(fracPart[d]) >= 5) {
    fracNum += 1n;
    if (fracNum >= 10n ** BigInt(d)) {
      fracNum = 0n;
      int += 1n;
    }
  }
  frac = d ? fracNum.toString().padStart(d, "0") : "";
  const minorBig = int * 10n ** BigInt(d) + (d ? BigInt(frac) : 0n);
  if (minorBig > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  let minor = Number(minorBig);
  if (neg) minor = -minor;
  if (minor === 0 && !opts.allowZero) return null;
  if (minor < 0 && !opts.allowNegative) return null;
  return minor;
}

/** True when a parsed amount is inside the accepted range (> 0, ≤ AMOUNT_LIMIT). */
export function amountInRange(minor: number): boolean {
  return Number.isInteger(minor) && minor > 0 && minor <= AMOUNT_LIMIT;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, locale: string | undefined, compact: boolean, hideDecimals: boolean) {
  const key = `${currency}|${locale ?? ""}|${compact}|${hideDecimals}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
        ...(hideDecimals && !compact ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
      });
    } catch {
      f = new Intl.NumberFormat(locale, { style: "currency", currency: DEFAULT_CURRENCY });
    }
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * Formats minor units in the given currency: formatMoney(125050, "INR") → "₹1,250.50".
 * `sign: "always"` prefixes + for positives; `compact` gives "₹1.2L" style short numbers.
 */
export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  opts: { locale?: string; sign?: "auto" | "always" | "never"; compact?: boolean; hideZeroDecimals?: boolean } = {},
): string {
  const locale = opts.locale ?? localeFor(currency);
  const major = toMajor(opts.sign === "never" ? Math.abs(minor) : minor, currency);
  const hide = !!opts.hideZeroDecimals && Number.isInteger(major);
  const out = formatter(currency, locale, !!opts.compact, hide).format(major);
  if (opts.sign === "always" && minor > 0) return `+${out}`;
  return out;
}

/** Plain number string for CSV/exports in major units ("1250.50", no grouping or symbol). */
export function toPlainString(minor: number, currency: string): string {
  return toInputString(minor, currency);
}
