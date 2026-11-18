import { NextResponse, type NextRequest } from "next/server";
import { createSession, throttle } from "@/lib/auth";
import { cookies } from "next/headers";
import { createDemoAccount, demoCookieValue, newDemoKey, pruneDemoAccounts } from "@/lib/demo-account";
import { DEMO_COOKIE, isDemo } from "@/lib/demo-mode";
import { isValidTz } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Safe in-app path to continue to after the demo account is ready. */
function nextPath(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/overview";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api/") ? next : "/overview";
}

/**
 * Demo mode only: gives this browser its own fictional sample account (Alex Rivera) in the
 * in-memory database, signs it in and continues to the app. Old demo accounts are removed.
 */
export async function GET(req: NextRequest) {
  if (!isDemo()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (req.nextUrl.searchParams.has("tz") && !throttle(`demo:${ip}`, 60, 60 * 60_000)) return NextResponse.json({ error: "Too many demo sessions. Try again later." }, { status: 429 });

  const tzParam = req.nextUrl.searchParams.get("tz");
  if (tzParam === null) return tzProbe(nextPath(req));
  const tz = tzParam && isValidTz(tzParam) ? tzParam : "UTC";
  await pruneDemoAccounts();
  const key = newDemoKey();
  const user = await createDemoAccount(tz, key);
  await createSession(user.id);
  // Lets every server instance rebuild this account (each one has its own in-memory database).
  (await cookies()).set(DEMO_COOKIE, demoCookieValue(key, tz), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return NextResponse.redirect(new URL(nextPath(req), req.url), 303);
}

/** The sample data is laid out around "today", so first ask the browser for its timezone. */
function tzProbe(next: string) {
  const qs = (tz: string) => `?tz=${encodeURIComponent(tz)}&next=${encodeURIComponent(next)}`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daybook demo</title>
<p style="font:16px system-ui;padding:24px">Opening the Daybook demo… <a href="/api/demo/start${qs("UTC")}">Continue</a></p>
<script>var tz="UTC";try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"}catch(e){}location.replace("/api/demo/start?tz="+encodeURIComponent(tz)+"&next=${encodeURIComponent(next)}")</script>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
