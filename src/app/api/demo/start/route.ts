import { NextResponse, type NextRequest } from "next/server";
import { createSession, sessionCookieOptions, throttle } from "@/lib/auth";
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
 * "Explore demo": gives this browser its own fictional sample account (Alex Rivera), signs it in and
 * continues to the app. Only runs when the visitor asks for it. The account is separate from every real
 * account (reserved email domain, no password), expires after DEMO_TTL_MS and is deleted on exit.
 * Without a database it lives in the in-memory store; with one, in the real database.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (req.nextUrl.searchParams.has("tz") && !throttle(`demo:${ip}`, 60, 60 * 60_000)) return NextResponse.json({ error: "Too many demo sessions. Try again later." }, { status: 429 });

  if (req.nextUrl.searchParams.has("blocked")) return cookiesBlocked(nextPath(req));
  const tzParam = req.nextUrl.searchParams.get("tz");
  if (tzParam === null) return tzProbe(nextPath(req));
  const tz = tzParam && isValidTz(tzParam) ? tzParam : "UTC";
  await pruneDemoAccounts();
  const key = newDemoKey();
  const user = await createDemoAccount(tz, key);
  await createSession(user.id);
  // In-memory mode: lets every server instance rebuild this account (each one has its own database).
  if (isDemo()) (await cookies()).set(DEMO_COOKIE, demoCookieValue(key, tz), { ...sessionCookieOptions(), maxAge: 30 * 86400 });
  // _d marks "just signed in": if the next page arrives without the cookie, the browser blocked it (see middleware).
  const url = new URL(nextPath(req), req.url);
  url.searchParams.set("_d", "1");
  return NextResponse.redirect(url, 303);
}

/** The sample data is laid out around "today", so first ask the browser for its timezone. */
function tzProbe(next: string) {
  const qs = (tz: string) => `?tz=${encodeURIComponent(tz)}&next=${encodeURIComponent(next)}`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyDiary demo</title>
<p style="font:16px system-ui;padding:24px">Opening the MyDiary demo… <a href="/api/demo/start${qs("UTC")}">Continue</a></p>
<script>var tz="UTC";try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"}catch(e){}location.replace("/api/demo/start?tz="+encodeURIComponent(tz)+"&next=${encodeURIComponent(next)}")</script>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** Shown instead of a redirect loop when the browser refuses the demo cookie (e.g. inside an embedded frame). */
function cookiesBlocked(next: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyDiary demo</title>
<div style="font:15px/1.5 system-ui,sans-serif;color:#1d1d24;max-width:340px;margin:0 auto;padding:48px 24px;text-align:center">
<p style="font-weight:600;font-size:17px;margin:0 0 8px">This browser blocked the demo's cookie here</p>
<p style="margin:0 0 20px;color:#555">The MyDiary demo keeps your sample account in a cookie. Open it in its own tab to try it.</p>
<a href="${next}" target="_blank" rel="noopener" style="display:inline-block;background:#635BFF;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Open MyDiary in a new tab</a></div>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
