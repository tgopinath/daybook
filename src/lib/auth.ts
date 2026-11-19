import "server-only";
import { cookies, headers } from "next/headers";
import { createHmac, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { db } from "./db";
import { secret as envSecret } from "./secrets";
import { DEMO_COOKIE, isDemo } from "./demo-mode";

export const SESSION_COOKIE = "pad_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  const secret = envSecret("AUTH_SECRET");
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  // Google-only and demo accounts store a non-bcrypt marker: no password can match it.
  if (!hash.startsWith("$2")) return false;
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });
}

/**
 * Session cookie flags. The demo is also shown inside the portfolio's phone frame (a cross-site iframe),
 * so demo cookies are SameSite=None + Partitioned (CHIPS); the real app keeps SameSite=Lax.
 */
export function sessionCookieOptions() {
  return isDemo()
    ? ({ httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/" } as const)
    : ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" } as const);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  clearCookie(jar, SESSION_COOKIE);
}

/**
 * Expires a cookie set with sessionCookieOptions(). A plain delete wouldn't match the Partitioned
 * demo cookies, which would then keep the visitor signed in.
 */
export function clearCookie(jar: Awaited<ReturnType<typeof cookies>>, name: string) {
  jar.set(name, "", { ...sessionCookieOptions(), maxAge: 0 });
}

/** Current user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const find = () =>
    db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true } } },
    });
  let session = await find();
  if (!session && isDemo()) {
    // Demo mode: this server instance may not have this browser's sample account yet.
    const { restoreDemoAccount } = await import("./demo-account");
    if (await restoreDemoAccount(jar.get(DEMO_COOKIE)?.value, hashToken(token), new Date(Date.now() + SESSION_DAYS * 864e5))) session = await find();
  }
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Naive in-memory throttle for auth endpoints (per process). Use a shared
// store such as Redis when running more than one instance.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function throttle(key: string, limit = 10, windowMs = 15 * 60_000) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}
