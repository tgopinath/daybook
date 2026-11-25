import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { GDS_COOKIE, GDS_COOKIE_PATH, SheetsError, exchangeSheetsCode, safeSheetsReturn, sheetsRedirectUri, type SheetsAttempt } from "../_sheets";
import { saveDriveToken, sheetsUnavailable } from "../_lib";

export const dynamic = "force-dynamic";

function readAttempt(raw: string | undefined): SheetsAttempt | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SheetsAttempt;
    return typeof a.state === "string" && typeof a.verifier === "string" && typeof a.userId === "string" ? a : null;
  } catch {
    return null;
  }
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google redirects here after consent: exchange the code, store the token encrypted, return with ?gds=… */
export async function GET(req: NextRequest) {
  const attempt = readAttempt(req.cookies.get(GDS_COOKIE)?.value);
  const returnTo = safeSheetsReturn(attempt?.returnTo);
  const done = (status: string) => {
    const url = new URL(returnTo, req.url);
    url.searchParams.set("gds", status);
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(GDS_COOKIE, "", { path: GDS_COOKIE_PATH, maxAge: 0 });
    res.headers.set("cache-control", "no-store");
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, req.url), 303);
  const reason = sheetsUnavailable(user);
  if (reason) return done(reason);

  const sp = req.nextUrl.searchParams;
  const googleError = sp.get("error");
  if (googleError) return done(googleError === "access_denied" ? "cancelled" : "error");
  const state = sp.get("state");
  const code = sp.get("code");
  if (!attempt || !state || !code || attempt.userId !== user.id) return done("expired");
  if (!same(state, attempt.state)) return done("error");

  try {
    const { accessToken, expiresAt } = await exchangeSheetsCode(code, attempt.verifier, sheetsRedirectUri(req), googleConfig()!);
    await saveDriveToken(user.id, accessToken, expiresAt);
    return done("connected");
  } catch (err) {
    console.error("[sheets] connect failed", err instanceof SheetsError ? err.message : err);
    return done(err instanceof SheetsError && err.status === 403 ? "denied" : "error");
  }
}
