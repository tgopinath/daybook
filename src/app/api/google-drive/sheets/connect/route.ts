import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { googleConfig } from "@/lib/google";
import { GDS_COOKIE, GDS_COOKIE_PATH, newSheetsAttempt, safeSheetsReturn, sheetsAuthorizationUrl, sheetsRedirectUri } from "../_sheets";
import { sheetsUnavailable } from "../_lib";

export const dynamic = "force-dynamic";

function back(req: NextRequest, path: string, status: string) {
  const url = new URL(path, req.url);
  url.searchParams.set("gds", status);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}

/** Starts the drive.file OAuth flow for Sheets export: `GET /api/google-drive/sheets/connect?return=/finance`. */
export async function GET(req: NextRequest) {
  const returnTo = safeSheetsReturn(req.nextUrl.searchParams.get("return"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, req.url), 303);
  const reason = sheetsUnavailable(user);
  if (reason) return back(req, returnTo, reason);
  const cfg = googleConfig()!;
  const attempt = newSheetsAttempt(user.id, returnTo);
  const res = NextResponse.redirect(sheetsAuthorizationUrl(attempt, cfg.clientId, sheetsRedirectUri(req), user.email), 303);
  res.cookies.set(GDS_COOKIE, Buffer.from(JSON.stringify(attempt)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Google's top-level redirect back to the callback
    path: GDS_COOKIE_PATH,
    maxAge: 600,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
