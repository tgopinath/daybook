import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSession } from "@/lib/auth";
import { isDemo } from "@/lib/demo-mode";
import { GoogleAuthError, OAUTH_COOKIE, exchangeCode, googleConfig, redirectUri, verifyIdToken, type OAuthAttempt } from "@/lib/google";
import { upsertGoogleUser } from "@/lib/google-account";

export const dynamic = "force-dynamic";

function done(req: NextRequest, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url), 303);
  res.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  res.headers.set("cache-control", "no-store");
  return res;
}
const fail = (req: NextRequest, code: string) => done(req, `/login?error=${code}`);

function readAttempt(raw: string | undefined): OAuthAttempt | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthAttempt;
    return typeof a.state === "string" && typeof a.verifier === "string" && typeof a.nonce === "string" ? a : null;
  } catch {
    return null;
  }
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google redirects here after consent. Verifies everything server-side, then signs the user in. */
export async function GET(req: NextRequest) {
  if (isDemo()) return fail(req, "no_database");
  const cfg = googleConfig();
  if (!cfg) return fail(req, "google_not_configured");

  const sp = req.nextUrl.searchParams;
  const googleError = sp.get("error");
  if (googleError) return fail(req, googleError === "access_denied" ? "google_cancelled" : "google_failed");

  const attempt = readAttempt(req.cookies.get(OAUTH_COOKIE)?.value);
  const state = sp.get("state");
  const code = sp.get("code");
  // Missing cookie usually means the attempt expired (10 min) or was started in another browser.
  if (!attempt || !state || !code) return fail(req, "google_expired");
  if (!same(state, attempt.state)) return fail(req, "google_state");

  try {
    const idToken = await exchangeCode(code, attempt.verifier, redirectUri(req), cfg);
    const profile = await verifyIdToken(idToken, { clientId: cfg.clientId, nonce: attempt.nonce });
    const { user } = await upsertGoogleUser(profile, attempt.tz);
    await createSession(user.id);
    return done(req, attempt.next || "/overview");
  } catch (err) {
    if (err instanceof GoogleAuthError) return fail(req, err.code === "email_unverified" ? "google_unverified" : "google_failed");
    console.error("[google] sign-in failed", err);
    return fail(req, "google_failed");
  }
}
