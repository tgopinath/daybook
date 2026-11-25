import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { GD_COOKIE, GD_COOKIE_PATH, gdAuthorizationUrl, gdRedirectUri, newGdAttempt, safeDriveReturn } from "@/lib/google-drive";
import { driveConnectUnavailable } from "../_lib";

export const dynamic = "force-dynamic";

function back(req: NextRequest, path: string, gd: string) {
  const url = new URL(path, req.url);
  url.searchParams.set("gd", gd);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}

/** Starts the Google Drive (drive.file) OAuth flow: `GET /api/google-drive/connect?return=/drive`. */
export async function GET(req: NextRequest) {
  const returnTo = safeDriveReturn(req.nextUrl.searchParams.get("return"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, req.url), 303);
  const reason = driveConnectUnavailable(user);
  if (reason) return back(req, returnTo, reason);
  const cfg = googleConfig()!;

  const attempt = newGdAttempt(user.id, returnTo);
  const res = NextResponse.redirect(gdAuthorizationUrl(attempt, cfg.clientId, gdRedirectUri(req), user.email), 303);
  res.cookies.set(GD_COOKIE, Buffer.from(JSON.stringify(attempt)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Google's top-level redirect back to the callback
    path: GD_COOKIE_PATH,
    maxAge: 600,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
