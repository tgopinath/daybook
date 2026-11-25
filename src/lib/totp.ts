import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Time-based one-time passwords (RFC 6238, built on HOTP / RFC 4226) for authenticator apps.
// HMAC-SHA1, 6 digits, 30-second steps: the defaults every authenticator app understands.
// Pure functions only; storage and replay bookkeeping live in two-factor.ts.

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ISSUER = "MyDiary";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32 (case-insensitive; spaces, dashes and "=" padding ignored). Throws on other characters. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new shared secret: 20 random bytes (160 bits, the RFC 4226 recommendation), base32-encoded. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP value for a counter (RFC 4226 §5.3 dynamic truncation). */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** The time step (counter) for a moment in time. */
export const timeStep = (nowMs = Date.now(), stepSeconds = TOTP_STEP_SECONDS) => Math.floor(nowMs / 1000 / stepSeconds);

/** TOTP code for a base32 secret at a moment in time. */
export function totp(secretB32: string, nowMs = Date.now(), digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretB32), timeStep(nowMs), digits);
}

/** Strips spaces and dashes users paste ("123 456"); returns null unless exactly 6 digits remain. */
export function normalizeCode(code: string): string | null {
  const c = code.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(c) ? c : null;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Replay protection: steps at or before `lastStep` (the last accepted one) are never accepted again.
 * Returns the matched step (persist it as the new lastStep) or null.
 */
export function verifyTotp(secretB32: string, code: string, opts: { nowMs?: number; lastStep?: number; window?: number } = {}): number | null {
  const c = normalizeCode(code);
  if (!c) return null;
  const key = base32Decode(secretB32);
  const current = timeStep(opts.nowMs ?? Date.now());
  const window = opts.window ?? 1;
  const last = opts.lastStep ?? -1;
  let matched: number | null = null;
  // Check every candidate (no early exit) so timing doesn't reveal which step matched.
  for (let s = current - window; s <= current + window; s++) {
    if (s <= last) continue;
    if (same(hotp(key, s), c) && matched === null) matched = s;
  }
  return matched;
}

/** otpauth:// URI that authenticator apps read from the QR code. */
export function otpauthUri(email: string, secretB32: string): string {
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({ secret: secretB32, issuer: TOTP_ISSUER, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Groups a secret in blocks of four for manual entry ("ABCD EFGH …"). */
export const formatSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();
