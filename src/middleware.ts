import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/lib/demo-mode";

// Edge gate: redirects signed-out visitors to /login. The session itself is
// verified against the database in every API route and server layout.
// In demo mode (no DATABASE_URL) signed-out visitors get their own sample account instead.
const PUBLIC = ["/login", "/signup", "/api/auth", "/api/cron", "/api/demo", "/sw.js", "/manifest.webmanifest", "/icon.svg"];

function demoStart(req: NextRequest, next: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/api/demo/start";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const demo = isDemo();
  if (demo && (pathname.startsWith("/login") || pathname.startsWith("/signup"))) {
    return demoStart(req, req.nextUrl.searchParams.get("next") ?? "");
  }
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.has("pad_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (demo) return demoStart(req, pathname);
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
