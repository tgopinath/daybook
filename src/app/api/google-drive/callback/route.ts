import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { GD_COOKIE, GD_COOKIE_PATH, GoogleDriveError, exchangeDriveCode, gdRedirectUri, safeDriveReturn, type GdAttempt } from "@/lib/google-drive";
import { driveConnectUnavailable, saveDriveToken } from "../_lib";

export const dynamic = "force-dynamic";

function readAttempt(raw: string | undefined): GdAttempt | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GdAttempt;
    return typeof a.state === "string" && typeof a.verifier === "string" && typeof a.userId === "string" ? a : null;
  } catch {
    return null;
  }
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google redirects here after consent: exchange the code, store the token encrypted, go back with ?gd=… */
export async function GET(req: NextRequest) {
  const attempt = readAttempt(req.cookies.get(GD_COOKIE)?.value);
  const returnTo = safeDriveReturn(attempt?.returnTo);
  const done = (gd: string) => {
    const url = new URL(returnTo, req.url);
    url.searchParams.set("gd", gd);
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(GD_COOKIE, "", { path: GD_COOKIE_PATH, maxAge: 0 });
    res.headers.set("cache-control", "no-store");
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, req.url), 303);
  const reason = driveConnectUnavailable(user);
  if (reason) return done(reason);

  const sp = req.nextUrl.searchParams;
  const googleError = sp.get("error");
  if (googleError) return done(googleError === "access_denied" ? "cancelled" : "error");
  const state = sp.get("state");
  const code = sp.get("code");
  // No cookie: the attempt expired (10 min) or was started in another browser / by another account.
  if (!attempt || !state || !code || attempt.userId !== user.id) return done("expired");
  if (!same(state, attempt.state)) return done("error");

  try {
    const { accessToken, expiresAt } = await exchangeDriveCode(code, attempt.verifier, gdRedirectUri(req), googleConfig()!);
    await saveDriveToken(user.id, accessToken, expiresAt);
    return done("connected");
  } catch (err) {
    console.error("[google-drive] connect failed", err instanceof GoogleDriveError ? err.message : err);
    return done(err instanceof GoogleDriveError && err.status === 403 ? "denied" : "error");
  }
}
