import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { GP_COOKIE, GP_COOKIE_PATH, gpAuthorizationUrl, gpRedirectUri, newGpAttempt, safeReturnPath } from "@/lib/google-photos";
import { unavailableReason } from "../_lib";

export const dynamic = "force-dynamic";

function back(req: NextRequest, path: string, gp: string) {
  const url = new URL(path, req.url);
  url.searchParams.set("gp", gp);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}

/** Starts the Google Photos Picker OAuth flow: `GET /api/google-photos/connect?return=/photos`. */
export async function GET(req: NextRequest) {
  const returnTo = safeReturnPath(req.nextUrl.searchParams.get("return"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, req.url), 303);
  const reason = unavailableReason(user);
  if (reason) return back(req, returnTo, reason);
  const cfg = googleConfig()!;

  const attempt = newGpAttempt(user.id, returnTo);
  const res = NextResponse.redirect(gpAuthorizationUrl(attempt, cfg.clientId, gpRedirectUri(req), user.email), 303);
  res.cookies.set(GP_COOKIE, Buffer.from(JSON.stringify(attempt)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Google's top-level redirect back to the callback
    path: GP_COOKIE_PATH,
    maxAge: 600,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
