import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, errorResponse, route } from "@/lib/api";
import { decrypt, encrypt } from "@/lib/crypto";
import { isDemoEmail } from "@/lib/demo-mode";
import { googleConfig } from "@/lib/google";
import { GooglePhotosError } from "@/lib/google-photos";
import { storageAvailable } from "@/lib/storage";

export type Unavailable = "demo" | "not_configured" | "no_storage" | "no_encryption";

export const UNAVAILABLE_MESSAGE: Record<Unavailable, string> = {
  demo: "Importing from Google Photos isn't available in the demo.",
  not_configured: "Google Photos import isn't set up on this server yet (Google sign-in isn't configured).",
  no_storage: "Photo storage isn't set up on this server yet, so imported photos would have nowhere to go.",
  no_encryption: "Google Photos import needs VAULT_ENCRYPTION_KEY to store the connection securely.",
};

function encryptionReady() {
  try {
    encrypt("check");
    return true;
  } catch {
    return false;
  }
}

/** Why Google Photos import can't work for this user/server, or null when it can. */
export function unavailableReason(user: { email: string }): Unavailable | null {
  if (isDemoEmail(user.email)) return "demo";
  if (!googleConfig()) return "not_configured";
  if (!storageAvailable()) return "no_storage";
  if (!encryptionReady()) return "no_encryption";
  return null;
}

export function assertAvailable(user: { email: string }) {
  const reason = unavailableReason(user);
  if (reason) throw new ApiError(reason === "demo" ? 403 : 503, UNAVAILABLE_MESSAGE[reason]);
}

export async function saveToken(userId: string, accessToken: string, expiresAt: Date) {
  const data = { googlePhotosTokenEnc: encrypt(accessToken), googlePhotosTokenExpires: expiresAt };
  await db.userSettings.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

export async function clearToken(userId: string) {
  await db.userSettings.updateMany({ where: { userId }, data: { googlePhotosTokenEnc: null, googlePhotosTokenExpires: null } });
}

/** The stored, unexpired access token, or null. */
export async function readToken(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { googlePhotosTokenEnc: true, googlePhotosTokenExpires: true } });
  if (!s?.googlePhotosTokenEnc || !s.googlePhotosTokenExpires || s.googlePhotosTokenExpires <= new Date()) return null;
  try {
    return decrypt(s.googlePhotosTokenEnc);
  } catch {
    return null;
  }
}

export class ReconnectError extends Error {}

/** Token or a ReconnectError (→ 401 { reconnect: true }). */
export async function requireToken(userId: string) {
  const token = await readToken(userId);
  if (!token) throw new ReconnectError("Connect Google Photos to continue.");
  return token;
}

/** Error → JSON. Expired/revoked Google access answers 401 { reconnect: true } and forgets the token. */
export async function gpErrorResponse(err: unknown, userId?: string) {
  if (err instanceof ReconnectError) return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
  if (err instanceof GooglePhotosError) {
    if (err.reconnect) {
      if (userId) await clearToken(userId).catch(() => {});
      return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return errorResponse(err);
}

type RouteFn<P extends Record<string, string>> = Parameters<typeof route<P>>[0];

/** route() whose Google errors become truthful JSON (and 401 { reconnect: true } when access lapsed). */
export function gpRoute<P extends Record<string, string> = Record<string, string>>(fn: RouteFn<P>) {
  return route<P>(async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      return gpErrorResponse(err, ctx.user?.id);
    }
  });
}
