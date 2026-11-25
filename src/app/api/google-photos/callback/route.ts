import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { GP_COOKIE, GP_COOKIE_PATH, GooglePhotosError, exchangePickerCode, gpRedirectUri, safeReturnPath, type GpAttempt } from "@/lib/google-photos";
import { saveToken, unavailableReason } from "../_lib";

export const dynamic = "force-dynamic";

function readAttempt(raw: string | undefined): GpAttempt | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GpAttempt;
    return typeof a.state === "string" && typeof a.verifier === "string" && typeof a.userId === "string" ? a : null;
  } catch {
    return null;
  }
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google redirects here after consent: exchange the code, store the token encrypted, go back with ?gp=… */
export async function GET(req: NextRequest) {
  const attempt = readAttempt(req.cookies.get(GP_COOKIE)?.value);
  const returnTo = safeReturnPath(attempt?.returnTo);
  const done = (gp: string) => {
    const url = new URL(returnTo, req.url);
    url.searchParams.set("gp", gp);
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(GP_COOKIE, "", { path: GP_COOKIE_PATH, maxAge: 0 });
    res.headers.set("cache-control", "no-store");
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, req.url), 303);
  const reason = unavailableReason(user);
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
    const { accessToken, expiresAt } = await exchangePickerCode(code, attempt.verifier, gpRedirectUri(req), googleConfig()!);
    await saveToken(user.id, accessToken, expiresAt);
    return done("connected");
  } catch (err) {
    console.error("[google-photos] connect failed", err instanceof GooglePhotosError ? err.message : err);
    return done(err instanceof GooglePhotosError && err.status === 403 ? "denied" : "error");
  }
}
