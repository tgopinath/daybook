import { z } from "zod";
import { ApiError, body, route } from "@/lib/api";
import { destroySession, getCurrentSession, verifyPassword } from "@/lib/auth";
import { LOCK_MAX_ATTEMPTS, LOCK_WINDOW_MS } from "@/lib/app-lock";
import { lockSettings } from "../shared";

// Wrong PINs per session (per process, like the other auth throttles). Only failures count.
const failures = new Map<string, { n: number; resetAt: number }>();

/** Unlocks the app-lock screen. After 5 wrong PINs in 15 minutes this session is signed out. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, z.object({ pin: z.string().max(20) }));
  const session = await getCurrentSession();
  if (!session) throw new ApiError(401, "Not signed in");
  const s = await lockSettings(user.id);
  if (!s.appLockPinHash) return { ok: true };

  const now = Date.now();
  for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);
  const f = failures.get(session.id);
  if (f && f.n >= LOCK_MAX_ATTEMPTS) {
    await destroySession();
    throw new ApiError(401, "Too many incorrect PINs. Sign in again.");
  }
  if (/^\d{4,8}$/.test(input.pin) && (await verifyPassword(input.pin, s.appLockPinHash))) {
    failures.delete(session.id);
    return { ok: true };
  }
  const next = { n: (f?.n ?? 0) + 1, resetAt: f?.resetAt ?? now + LOCK_WINDOW_MS };
  failures.set(session.id, next);
  if (next.n >= LOCK_MAX_ATTEMPTS) {
    failures.delete(session.id);
    await destroySession();
    throw new ApiError(401, "Too many incorrect PINs. Sign in again.");
  }
  const left = LOCK_MAX_ATTEMPTS - next.n;
  throw new ApiError(400, `Incorrect PIN. ${left} ${left === 1 ? "try" : "tries"} left before you'll need to sign in again.`);
});
