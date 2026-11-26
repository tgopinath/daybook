import { NextResponse, type NextRequest } from "next/server";
import { throttle } from "@/lib/auth";
import { isDemo } from "@/lib/demo-mode";
import { OAUTH_COOKIE, authorizationUrl, googleConfig, newOAuthAttempt, redirectUri } from "@/lib/google";
import { isValidTz } from "@/lib/time";

export const dynamic = "force-dynamic";

const loginError = (req: NextRequest, code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, req.url), 303);

/** Starts Google sign-in: stores one-time state in an httpOnly cookie and redirects to Google. */
export async function GET(req: NextRequest) {
  if (isDemo()) return loginError(req, "no_database");
  const cfg = googleConfig();
  if (!cfg) return loginError(req, "google_not_configured");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!throttle(`google:${ip}`, 30)) return loginError(req, "too_many_attempts");

  const rawNext = req.nextUrl.searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/api/") ? rawNext : "/my-space";
  const rawTz = req.nextUrl.searchParams.get("tz") ?? "";
  const attempt = newOAuthAttempt(next, isValidTz(rawTz) ? rawTz : "UTC");

  const res = NextResponse.redirect(authorizationUrl(attempt, cfg.clientId, redirectUri(req)), 303);
  res.cookies.set(OAUTH_COOKIE, Buffer.from(JSON.stringify(attempt)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Google's top-level redirect back to the callback
    path: "/api/auth/google",
    maxAge: 600,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
