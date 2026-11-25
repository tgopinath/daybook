import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { getCurrentSession, verifyPassword } from "@/lib/auth";
import { FRESH_SIGN_IN_MS } from "@/lib/app-lock";

export async function lockSettings(userId: string) {
  return db.userSettings.upsert({ where: { userId }, update: {}, create: { userId }, select: { appLockPinHash: true, appLockMinutes: true } });
}

/** Changing or removing an existing PIN needs that PIN, unless this session signed in within the last few minutes. */
export async function assertMayChangePin(currentHash: string | null, currentPin: string | undefined) {
  if (!currentHash) return;
  if (currentPin && (await verifyPassword(currentPin, currentHash))) return;
  const session = await getCurrentSession();
  if (session && Date.now() - session.createdAt.getTime() < FRESH_SIGN_IN_MS) return;
  throw new ApiError(400, currentPin ? "Current PIN is incorrect" : "Enter your current PIN");
}
