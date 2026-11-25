import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { PIN_PATTERN, isLockMinutes } from "@/lib/app-lock";
import { assertNotDemo, assertThrottle } from "../guard";
import { assertMayChangePin, lockSettings } from "./shared";

const pin = z.string().regex(PIN_PATTERN, "Use 4 to 8 digits");
const minutes = z.number().int().refine(isLockMinutes, "Choose 1, 5, 15, 30 or 60 minutes");

/** Sets or changes the app-lock PIN (bcrypt hash only) and the inactivity timeout. */
export const POST = route(async ({ req, user }) => {
  assertNotDemo(user.email, "App lock");
  assertThrottle(`lock-set:${user.id}`, 10);
  const input = await body(req, z.object({ pin, minutes, currentPin: z.string().max(8).optional() }));
  const s = await lockSettings(user.id);
  await assertMayChangePin(s.appLockPinHash, input.currentPin);
  await db.userSettings.update({ where: { userId: user.id }, data: { appLockPinHash: await hashPassword(input.pin), appLockMinutes: input.minutes } });
  return { ok: true, minutes: input.minutes };
});

/** Changes only the inactivity timeout. */
export const PATCH = route(async ({ req, user }) => {
  const input = await body(req, z.object({ minutes }));
  const s = await lockSettings(user.id);
  if (!s.appLockPinHash) throw new ApiError(409, "Set a PIN first");
  await db.userSettings.update({ where: { userId: user.id }, data: { appLockMinutes: input.minutes } });
  return { ok: true, minutes: input.minutes };
});
