import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateSecret, hotp, normalizeCode, otpauthUri, timeStep, totp, verifyTotp } from "./totp";

const RFC_KEY = Buffer.from("12345678901234567890", "ascii");
const RFC_B32 = base32Encode(RFC_KEY);

describe("base32", () => {
  it("round-trips and matches the RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi======").toString()).toBe("foobar");
    expect(RFC_B32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(() => base32Decode("ABC1")).toThrow();
  });

  it("generates 160-bit secrets", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
    expect(generateSecret()).not.toBe(s);
  });
});

describe("HOTP (RFC 4226 Appendix D)", () => {
  it("matches the test vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(RFC_KEY, counter)).toBe(code));
  });
});

describe("TOTP (RFC 6238 Appendix B, SHA-1)", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  it.each(vectors)("T=%i → %s", (t, code) => {
    expect(totp(RFC_B32, t * 1000, 8)).toBe(code);
    expect(totp(RFC_B32, t * 1000)).toBe(code.slice(2)); // 6-digit = last 6 digits
  });
});

describe("verifyTotp", () => {
  const now = 1_700_000_000_000;
  const step = timeStep(now);
  const at = (s: number) => totp(RFC_B32, s * 30_000);

  it("accepts the current code and ±1 step, rejects ±2", () => {
    expect(verifyTotp(RFC_B32, at(step), { nowMs: now })).toBe(step);
    expect(verifyTotp(RFC_B32, at(step - 1), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(RFC_B32, at(step + 1), { nowMs: now })).toBe(step + 1);
    expect(verifyTotp(RFC_B32, at(step - 2), { nowMs: now })).toBeNull();
    expect(verifyTotp(RFC_B32, at(step + 2), { nowMs: now })).toBeNull();
  });

  it("rejects replays: steps at or before lastStep", () => {
    expect(verifyTotp(RFC_B32, at(step), { nowMs: now, lastStep: step })).toBeNull();
    expect(verifyTotp(RFC_B32, at(step - 1), { nowMs: now, lastStep: step - 1 })).toBeNull();
    expect(verifyTotp(RFC_B32, at(step), { nowMs: now, lastStep: step - 1 })).toBe(step);
    // a newer step is still fine after an older one was used
    expect(verifyTotp(RFC_B32, at(step + 1), { nowMs: now, lastStep: step })).toBe(step + 1);
  });

  it("normalises pasted codes and rejects junk", () => {
    const c = at(step);
    expect(verifyTotp(RFC_B32, `${c.slice(0, 3)} ${c.slice(3)}`, { nowMs: now })).toBe(step);
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("1234567")).toBeNull();
    expect(normalizeCode("abcdef")).toBeNull();
    expect(verifyTotp(RFC_B32, "", { nowMs: now })).toBeNull();
  });

  it("builds an otpauth URI authenticator apps understand", () => {
    const raw = otpauthUri("sam+x@example.com", RFC_B32);
    expect(raw.startsWith("otpauth://totp/MyDiary:sam%2Bx%40example.com?")).toBe(true);
    const u = new URL(raw);
    expect(u.host).toBe("totp");
    expect(u.searchParams.get("secret")).toBe(RFC_B32);
    expect(u.searchParams.get("issuer")).toBe("MyDiary");
  });
});
