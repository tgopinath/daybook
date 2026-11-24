import { NextResponse, type NextRequest } from "next/server";

// Edge gate: redirects signed-out visitors to /login. The session itself is
// verified against the database in every API route and server layout.
// The demo never starts on its own: visitors choose "Explore demo" on the sign-in screen.
const PUBLIC = ["/login", "/signup", "/privacy", "/api/auth", "/api/cron", "/api/demo", "/sw.js", "/manifest.webmanifest", "/icon.svg"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.has("pad_session")) {
    if (!req.nextUrl.searchParams.has("_d")) return NextResponse.next();
    const clean = req.nextUrl.clone(); // drop the demo sign-in marker from the address bar
    clean.searchParams.delete("_d");
    return NextResponse.redirect(clean);
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Arrived straight from /api/demo/start but without the cookie: the browser blocked it, so don't loop.
  if (req.nextUrl.searchParams.has("_d")) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/demo/start";
    url.search = `?blocked=1&next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
