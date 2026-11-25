import "server-only";
import { createHmac, randomBytes, randomInt } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { decryptJSON, encryptJSON } from "./crypto";
import { secret as envSecret } from "./secrets";
import { generateSecret, otpauthUri, verifyTotp } from "./totp";

// Two-step verification for email + password sign-in.
//
// User.totpSecretEnc holds AES-GCM encrypted JSON: { secret, lastStep, fails }.
//  - secret:   base32 TOTP secret. While User.totpEnabledAt is null the secret is a pending setup.
//  - lastStep: last accepted time step. Codes at or before it are rejected (replay protection that
//              works across serverless instances because it lives in the database).
//  - fails:    failed code attempts in the current hour (per-user throttle, also database-backed).
// Writes use compare-and-swap on the ciphertext so two concurrent requests can't both accept a code.

export const BACKUP_CODE_COUNT = 10;
export const MAX_FAILS_PER_HOUR = 20;
const HOUR = 3600_000;
export const TICKET_TTL_SECONDS = 5 * 60;
export const TICKET_MAX_ATTEMPTS = 5;

type TotpState = { secret: string; lastStep: number; fails?: { n: number; since: number } };

function authSecret() {
  const s = envSecret("AUTH_SECRET");
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const hmac = (purpose: string, data: string) => createHmac("sha256", authSecret()).update(`${purpose}\u0000${data}`).digest("hex");

export function readState(enc: string | null | undefined): TotpState | null {
  if (!enc) return null;
  try {
    const s = decryptJSON<TotpState>(enc);
    return typeof s?.secret === "string" && typeof s.lastStep === "number" ? s : null;
  } catch {
    return null;
  }
}

const seal = (s: TotpState) => encryptJSON(s);

/** Compare-and-swap: writes only if the stored ciphertext is still `prevEnc`. */
async function swapState(userId: string, prevEnc: string, next: TotpState, extra: { totpEnabledAt?: Date } = {}) {
  const r = await db.user.updateMany({ where: { id: userId, totpSecretEnc: prevEnc }, data: { totpSecretEnc: seal(next), ...extra } });
  return r.count === 1;
}

// ── Setup ────────────────────────────────────────────────────────────────────

/** Creates a new pending secret (replacing any earlier pending one). Refuses when 2FA is already on. */
export async function startSetup(userId: string, email: string) {
  const secret = generateSecret();
  const r = await db.user.updateMany({ where: { id: userId, totpEnabledAt: null }, data: { totpSecretEnc: seal({ secret, lastStep: 0 }) } });
  if (r.count !== 1) return null;
  return { secret, uri: otpauthUri(email, secret) };
}

export type CodeResult = "ok" | "invalid" | "throttled" | "unavailable";

/**
 * Verifies a 6-digit code against the user's secret (pending or enabled, as requested),
 * advancing lastStep on success and counting failures towards the hourly limit.
 */
export async function checkCode(userId: string, code: string, opts: { pending?: boolean; nowMs?: number; enable?: boolean } = {}): Promise<CodeResult> {
  const now = opts.nowMs ?? Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true } });
    if (!row?.totpSecretEnc) return "unavailable";
    if (opts.pending ? row.totpEnabledAt !== null : row.totpEnabledAt === null) return "unavailable";
    const state = readState(row.totpSecretEnc);
    if (!state) return "unavailable";
    const fails = state.fails && now - state.fails.since < HOUR ? state.fails : { n: 0, since: now };
    if (fails.n >= MAX_FAILS_PER_HOUR) return "throttled";
    const step = verifyTotp(state.secret, code, { nowMs: now, lastStep: state.lastStep });
    const next: TotpState = step !== null ? { secret: state.secret, lastStep: step } : { ...state, fails: { n: fails.n + 1, since: fails.since } };
    const extra = step !== null && opts.enable ? { totpEnabledAt: new Date(now) } : {};
    if (await swapState(userId, row.totpSecretEnc, next, extra)) return step !== null ? "ok" : "invalid";
    // Lost a race with another request: re-read and try again (the other request may have used this code).
  }
  return "invalid";
}

/** Records a failed attempt that wasn't a TOTP code (e.g. a wrong backup code). Returns false when over the limit. */
export async function recordFailure(userId: string, nowMs = Date.now()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true } });
    const state = readState(row?.totpSecretEnc);
    if (!row?.totpSecretEnc || !state) return false;
    const fails = state.fails && nowMs - state.fails.since < HOUR ? state.fails : { n: 0, since: nowMs };
    if (await swapState(userId, row.totpSecretEnc, { ...state, fails: { n: fails.n + 1, since: fails.since } })) return fails.n + 1 < MAX_FAILS_PER_HOUR;
  }
  return false;
}

/** True when the user has used up the hourly attempts. */
export async function isThrottled(userId: string, nowMs = Date.now()) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true } });
  const f = readState(row?.totpSecretEnc)?.fails;
  return !!f && nowMs - f.since < HOUR && f.n >= MAX_FAILS_PER_HOUR;
}

/** Turns 2FA off: removes the secret and every backup code. */
export async function disableTwoFactor(userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null } }),
    db.backupCode.deleteMany({ where: { userId } }),
  ]);
}

// ── Backup codes ─────────────────────────────────────────────────────────────

const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

/** Ten single-use codes like "k7m2q-x9p4t" (~49 bits each). */
export function generateBackupCodes(n = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: n }, () => {
    let s = "";
    for (let i = 0; i < 10; i++) s += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normalizeBackupCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Only an HMAC (keyed with AUTH_SECRET, bound to the user) is stored. */
export const hashBackupCode = (userId: string, code: string) => hmac("backup-code:v1", `${userId}:${normalizeBackupCode(code)}`);

/** Replaces all backup codes with a fresh set and returns the plain codes (shown once). */
export async function replaceBackupCodes(userId: string) {
  const codes = generateBackupCodes();
  await db.$transaction([
    db.backupCode.deleteMany({ where: { userId } }),
    db.backupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(userId, c) })) }),
  ]);
  return codes;
}

/** Marks a backup code used. Atomic: a code can only ever be redeemed once. */
export async function redeemBackupCode(userId: string, code: string) {
  const norm = normalizeBackupCode(code);
  if (norm.length !== 10) return false;
  const r = await db.backupCode.updateMany({ where: { userId, codeHash: hashBackupCode(userId, norm), usedAt: null }, data: { usedAt: new Date() } });
  return r.count === 1;
}

export const remainingBackupCodes = (userId: string) => db.backupCode.count({ where: { userId, usedAt: null } });

// ── Sign-in tickets ──────────────────────────────────────────────────────────
// After the password check, the login route hands out a short-lived signed ticket instead of a session.
// The ticket carries a fingerprint of the user's sign-in state (password hash, 2FA state, last accepted
// step, unused backup codes). Any successful second step changes that state, so a ticket can't be reused
// after it worked, on any server instance. Used nonces are also remembered in memory as a second guard.

const ticketKey = () => new Uint8Array(createHmac("sha256", authSecret()).update("mydiary-2fa-ticket-v1").digest());
const AUDIENCE = "mydiary:2fa";

/** Fingerprint of the state a ticket is bound to. */
export async function signInFingerprint(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, totpSecretEnc: true, totpEnabledAt: true } });
  if (!user?.totpEnabledAt) return null;
  const state = readState(user.totpSecretEnc);
  if (!state) return null;
  const unused = await remainingBackupCodes(userId);
  return hmac("2fa-fingerprint:v1", [userId, user.passwordHash, user.totpEnabledAt.getTime(), state.lastStep, unused].join("|")).slice(0, 32);
}

export async function signTicket(userId: string, fingerprint: string, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({ fp: fingerprint })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt(iat)
    .setExpirationTime(iat + TICKET_TTL_SECONDS)
    .sign(ticketKey());
}

/** Verifies signature, audience and expiry. Returns the claims or null. */
export async function readTicket(token: string, nowMs = Date.now()) {
  try {
    const { payload } = await jwtVerify(token, ticketKey(), { audience: AUDIENCE, algorithms: ["HS256"], currentDate: new Date(nowMs) });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string" || typeof payload.fp !== "string" || typeof payload.exp !== "number") return null;
    return { userId: payload.sub, jti: payload.jti, fp: payload.fp, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function issueTicket(userId: string) {
  const fp = await signInFingerprint(userId);
  return fp ? signTicket(userId, fp) : null;
}

// Per-process memory (best effort; the fingerprint is the cross-instance guard).
const usedTickets = new Map<string, number>(); // jti -> exp (ms)
const ticketAttempts = new Map<string, { n: number; exp: number }>();
function sweep(now: number) {
  for (const [k, exp] of usedTickets) if (exp < now) usedTickets.delete(k);
  for (const [k, v] of ticketAttempts) if (v.exp < now) ticketAttempts.delete(k);
}

export type TicketCheck = { ok: true; userId: string; jti: string; exp: number } | { ok: false; reason: "invalid" | "expired_or_used" | "too_many" };

/** Validates a ticket for one more attempt (counts the attempt). */
export async function useTicketAttempt(token: string, nowMs = Date.now()): Promise<TicketCheck> {
  sweep(nowMs);
  const t = await readTicket(token, nowMs);
  if (!t) return { ok: false, reason: "expired_or_used" };
  if (usedTickets.has(t.jti)) return { ok: false, reason: "expired_or_used" };
  const a = ticketAttempts.get(t.jti) ?? { n: 0, exp: t.exp * 1000 };
  a.n++;
  ticketAttempts.set(t.jti, a);
  if (a.n > TICKET_MAX_ATTEMPTS) return { ok: false, reason: "too_many" };
  const fp = await signInFingerprint(t.userId);
  if (!fp || fp !== t.fp) return { ok: false, reason: "expired_or_used" };
  return { ok: true, userId: t.userId, jti: t.jti, exp: t.exp };
}

export function markTicketUsed(jti: string, expSeconds: number) {
  usedTickets.set(jti, expSeconds * 1000);
  ticketAttempts.delete(jti);
}
