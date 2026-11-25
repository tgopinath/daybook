import { describe, expect, it } from "vitest";
import { AMOUNT_LIMIT, amountInRange, formatMoney, isCurrency, minorDigits, parseAmount, toInputString, toMajor } from "./money";

describe("parseAmount", () => {
  it("parses grouped and plain input into minor units", () => {
    expect(parseAmount("1,250.50", "INR")).toBe(125050);
    expect(parseAmount("1250", "INR")).toBe(125000);
    expect(parseAmount("12.5", "INR")).toBe(1250);
    expect(parseAmount(".75", "USD")).toBe(75);
    expect(parseAmount("1,00,000", "INR")).toBe(10000000);
    expect(parseAmount("₹ 2,499", "INR")).toBe(249900);
    expect(parseAmount("USD 10.10", "USD")).toBe(1010);
    expect(parseAmount(42, "INR")).toBe(4200);
  });
  it("treats a lone short comma group as a decimal comma", () => {
    expect(parseAmount("12,50", "EUR")).toBe(1250);
    expect(parseAmount("1,250", "EUR")).toBe(125000);
  });
  it("rounds extra decimals half-up", () => {
    expect(parseAmount("10.005", "INR")).toBe(1001);
    expect(parseAmount("10.004", "INR")).toBe(1000);
    expect(parseAmount("9.999", "INR")).toBe(1000);
  });
  it("respects zero-decimal and three-decimal currencies", () => {
    expect(minorDigits("JPY")).toBe(0);
    expect(parseAmount("1,200", "JPY")).toBe(1200);
    expect(parseAmount("1200.6", "JPY")).toBe(1201);
    expect(minorDigits("BHD")).toBe(3);
    expect(parseAmount("1.5", "BHD")).toBe(1500);
  });
  it("rejects junk, zero and negatives unless allowed", () => {
    for (const bad of ["", "abc", ".", "1.2.3", "0", "0.00", "-5", "5-"]) expect(parseAmount(bad, "INR")).toBeNull();
    expect(parseAmount(null, "INR")).toBeNull();
    expect(parseAmount("-5", "INR", { allowNegative: true })).toBe(-500);
    expect(parseAmount("0", "INR", { allowZero: true })).toBe(0);
  });
});

describe("range", () => {
  it("accepts amounts > 0 up to the limit", () => {
    expect(amountInRange(1)).toBe(true);
    expect(amountInRange(AMOUNT_LIMIT)).toBe(true);
    expect(amountInRange(AMOUNT_LIMIT + 1)).toBe(false);
    expect(amountInRange(0)).toBe(false);
    expect(amountInRange(1.5)).toBe(false);
    expect(AMOUNT_LIMIT).toBeLessThanOrEqual(1e12);
  });
});

describe("formatting", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatMoney(125050, "INR")).toBe("₹1,250.50");
    expect(formatMoney(10000000, "INR")).toBe("₹1,00,000.00");
    expect(formatMoney(-125050, "INR")).toBe("-₹1,250.50");
    expect(formatMoney(125050, "INR", { sign: "always" })).toBe("+₹1,250.50");
    expect(formatMoney(-125050, "INR", { sign: "never" })).toBe("₹1,250.50");
    expect(formatMoney(150000, "INR", { hideZeroDecimals: true })).toBe("₹1,500");
  });
  it("formats other currencies", () => {
    expect(formatMoney(123456, "USD", { locale: "en-US" })).toBe("$1,234.56");
    expect(formatMoney(1200, "JPY", { locale: "en-US" })).toBe("¥1,200");
  });
  it("round-trips through the edit string", () => {
    expect(toInputString(125050, "INR")).toBe("1250.50");
    expect(toInputString(5, "INR")).toBe("0.05");
    expect(toInputString(1200, "JPY")).toBe("1200");
    expect(parseAmount(toInputString(987654, "INR"), "INR")).toBe(987654);
    expect(toMajor(125050, "INR")).toBe(1250.5);
  });
  it("validates ISO codes", () => {
    expect(isCurrency("INR")).toBe(true);
    expect(isCurrency("usd")).toBe(false);
    expect(isCurrency("XYZQ")).toBe(false);
  });
});
