import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { runDispatcher } from "@/lib/dispatcher";
import { isDemo } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackAddr(a: string) {
  const v = a.trim().replace(/^::ffff:/, "");
  return v === "127.0.0.1" || v === "::1" || v === "localhost";
}

/**
 * Authorisation: when CRON_SECRET is set, require `Authorization: Bearer <secret>`.
 * Without a secret, only requests addressed to and forwarded from localhost are accepted.
 */
function authorised(req: NextRequest) {
  if (isDemo()) return false; // no scheduled jobs in demo mode
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  }
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!LOOPBACK.has(host)) return false;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd && !fwd.split(",").every(isLoopbackAddr)) return false;
  const real = req.headers.get("x-real-ip");
  if (real && !isLoopbackAddr(real)) return false;
  return true;
}

async function handle(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runDispatcher();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/dispatch]", err);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
