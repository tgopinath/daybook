import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`);

type Ctx<P> = { req: NextRequest; user: CurrentUser; params: P };

/**
 * Wraps a route handler: requires an authenticated user, rejects cross-site
 * writes, maps Zod/ApiError to JSON errors. Return a plain object (sent as
 * JSON) or a Response.
 */
export function route<P extends Record<string, string> = Record<string, string>>(
  fn: (ctx: Ctx<P>) => Promise<unknown>,
  opts: { auth?: boolean } = {},
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const user = await getCurrentUser();
      if (!user && opts.auth !== false) throw new ApiError(401, "Not signed in");
      const params = (await ctx?.params) ?? ({} as P);
      const out = await fn({ req, user: user as CurrentUser, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input", issues: err.issues },
      { status: 400 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
  return schema.parse(json);
}

export function query(req: NextRequest) {
  return req.nextUrl.searchParams;
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers / server-to-server with auth header
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (new URL(origin).host !== host) throw new ApiError(403, "Cross-origin request blocked");
}

/** The caller's timezone: x-tz header from the client, else UTC. */
export function tzOf(req: NextRequest): string {
  const tz = req.headers.get("x-tz");
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      /* fall through */
    }
  }
  return "UTC";
}
