import { NextResponse, type NextRequest } from "next/server";

// Edge gate: redirects signed-out visitors to /login. The session itself is
// verified against the database in every API route and server layout.
const PUBLIC = ["/login", "/signup", "/api/auth", "/api/cron", "/sw.js", "/manifest.webmanifest", "/icon.svg"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.has("pad_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
