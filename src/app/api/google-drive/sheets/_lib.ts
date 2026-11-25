import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, errorResponse, route } from "@/lib/api";
import { decrypt, encrypt } from "@/lib/crypto";
import { isDemoEmail } from "@/lib/demo-mode";
import { googleConfig } from "@/lib/google";
import { SheetsError } from "./_sheets";

// Token storage is shared with My Storage's Google Drive connection (same drive.file scope, same
// UserSettings.googleDriveTokenEnc/Expires fields, same encrypt() format).

export type SheetsUnavailable = "demo" | "not_configured" | "no_encryption";

export const SHEETS_UNAVAILABLE_MESSAGE: Record<SheetsUnavailable, string> = {
  demo: "Exporting to Google Sheets isn't available in the demo. CSV export works.",
  not_configured: "Google Sheets export isn't set up on this server yet (Google sign-in isn't configured). CSV export works.",
  no_encryption: "Google Sheets export needs VAULT_ENCRYPTION_KEY to store the connection securely.",
};

function encryptionReady() {
  try {
    encrypt("check");
    return true;
  } catch {
    return false;
  }
}

export function sheetsUnavailable(user: { email: string }): SheetsUnavailable | null {
  if (isDemoEmail(user.email)) return "demo";
  if (!googleConfig()) return "not_configured";
  if (!encryptionReady()) return "no_encryption";
  return null;
}

export function assertSheetsAvailable(user: { email: string }) {
  const reason = sheetsUnavailable(user);
  if (reason) throw new ApiError(reason === "demo" ? 403 : 503, SHEETS_UNAVAILABLE_MESSAGE[reason]);
}

export async function sheetsStatus(user: { id: string; email: string }) {
  const reason = sheetsUnavailable(user);
  const s = await db.userSettings.findUnique({ where: { userId: user.id }, select: { googleDriveTokenEnc: true, googleDriveTokenExpires: true } });
  const connected = !!s?.googleDriveTokenEnc && !!s.googleDriveTokenExpires && s.googleDriveTokenExpires > new Date();
  return { available: !reason, reason, message: reason ? SHEETS_UNAVAILABLE_MESSAGE[reason] : null, connected: !reason && connected };
}

export async function saveDriveToken(userId: string, accessToken: string, expiresAt: Date) {
  const data = { googleDriveTokenEnc: encrypt(accessToken), googleDriveTokenExpires: expiresAt };
  await db.userSettings.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

export async function clearDriveToken(userId: string) {
  await db.userSettings.updateMany({ where: { userId }, data: { googleDriveTokenEnc: null, googleDriveTokenExpires: null } });
}

export class ReconnectError extends Error {}

/** The stored, unexpired token or a ReconnectError (→ 401 { reconnect: true }). */
export async function requireDriveToken(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { googleDriveTokenEnc: true, googleDriveTokenExpires: true } });
  if (!s?.googleDriveTokenEnc || !s.googleDriveTokenExpires || s.googleDriveTokenExpires <= new Date()) throw new ReconnectError("Connect Google to export to Sheets.");
  try {
    return decrypt(s.googleDriveTokenEnc);
  } catch {
    throw new ReconnectError("Connect Google to export to Sheets.");
  }
}

type RouteFn<P extends Record<string, string>> = Parameters<typeof route<P>>[0];

/** route() whose Google errors become truthful JSON, and 401 { reconnect: true } when access lapsed. */
export function sheetsRoute<P extends Record<string, string> = Record<string, string>>(fn: RouteFn<P>) {
  return route<P>(async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof ReconnectError) return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
      if (err instanceof SheetsError) {
        if (err.reconnect) {
          await clearDriveToken(ctx.user.id).catch(() => {});
          return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
        }
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return errorResponse(err);
    }
  });
}
