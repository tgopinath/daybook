import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, errorResponse, route } from "@/lib/api";
import { decrypt, encrypt } from "@/lib/crypto";
import { isDemoEmail } from "@/lib/demo-mode";
import { googleConfig } from "@/lib/google";
import { GoogleDriveError, projectNumberFromClientId } from "@/lib/google-drive";
import { storageAvailable } from "@/lib/storage";

// Shared by the My Storage import and (via readDriveToken/saveDriveToken) the Finance Sheets export:
// both use the same drive.file token in UserSettings.googleDriveTokenEnc/Expires.

export type DriveUnavailable = "demo" | "not_configured" | "no_storage" | "no_encryption";

export const DRIVE_UNAVAILABLE_MESSAGE: Record<DriveUnavailable, string> = {
  demo: "Importing from Google Drive isn't available in the demo.",
  not_configured: "Google Drive import isn't set up on this server yet (Google sign-in isn't configured).",
  no_storage: "File storage isn't set up on this server yet, so imported files would have nowhere to go.",
  no_encryption: "Google Drive import needs VAULT_ENCRYPTION_KEY to store the connection securely.",
};

/** Browser API key for the Google Picker (public by design; restrict it to this site in Google Cloud). */
export const pickerApiKey = () => process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim() || null;
export const pickerAppId = () => projectNumberFromClientId(googleConfig()?.clientId);

function encryptionReady() {
  try {
    encrypt("check");
    return true;
  } catch {
    return false;
  }
}

/** Why connecting Google Drive can't work for this user/server, or null when it can. */
export function driveConnectUnavailable(user: { email: string }): Exclude<DriveUnavailable, "no_storage"> | null {
  if (isDemoEmail(user.email)) return "demo";
  if (!googleConfig()) return "not_configured";
  if (!encryptionReady()) return "no_encryption";
  return null;
}

/** Why importing into My Storage can't work, or null. */
export function driveImportUnavailable(user: { email: string }): DriveUnavailable | null {
  const reason = driveConnectUnavailable(user);
  if (reason) return reason;
  if (!storageAvailable()) return "no_storage";
  return null;
}

export function assertImportAvailable(user: { email: string }) {
  const reason = driveImportUnavailable(user);
  if (reason) throw new ApiError(reason === "demo" ? 403 : 503, DRIVE_UNAVAILABLE_MESSAGE[reason]);
}

export async function saveDriveToken(userId: string, accessToken: string, expiresAt: Date) {
  const data = { googleDriveTokenEnc: encrypt(accessToken), googleDriveTokenExpires: expiresAt };
  await db.userSettings.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

export async function clearDriveToken(userId: string) {
  await db.userSettings.updateMany({ where: { userId }, data: { googleDriveTokenEnc: null, googleDriveTokenExpires: null } });
}

/** The stored, unexpired access token and its expiry, or null. */
export async function readDriveToken(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId }, select: { googleDriveTokenEnc: true, googleDriveTokenExpires: true } });
  if (!s?.googleDriveTokenEnc || !s.googleDriveTokenExpires || s.googleDriveTokenExpires <= new Date()) return null;
  try {
    return { token: decrypt(s.googleDriveTokenEnc), expiresAt: s.googleDriveTokenExpires };
  } catch {
    return null;
  }
}

export class DriveReconnectError extends Error {}

/** Token or a DriveReconnectError (→ 401 { reconnect: true }). */
export async function requireDriveToken(userId: string) {
  const t = await readDriveToken(userId);
  if (!t) throw new DriveReconnectError("Connect Google Drive to continue.");
  return t.token;
}

/** Error → JSON. Expired/revoked Google access answers 401 { reconnect: true } and forgets the token. */
export async function gdErrorResponse(err: unknown, userId?: string) {
  if (err instanceof DriveReconnectError) return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
  if (err instanceof GoogleDriveError) {
    if (err.reconnect) {
      if (userId) await clearDriveToken(userId).catch(() => {});
      return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return errorResponse(err);
}

type RouteFn<P extends Record<string, string>> = Parameters<typeof route<P>>[0];

/** route() whose Google errors become truthful JSON (and 401 { reconnect: true } when access lapsed). */
export function gdRoute<P extends Record<string, string> = Record<string, string>>(fn: RouteFn<P>) {
  return route<P>(async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      return gdErrorResponse(err, ctx.user?.id);
    }
  });
}
