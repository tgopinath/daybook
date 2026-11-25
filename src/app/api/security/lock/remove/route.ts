import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { assertThrottle } from "../../guard";
import { assertMayChangePin, lockSettings } from "../shared";

/** Turns app lock off. Needs the current PIN unless this session just signed in. */
export const POST = route(async ({ req, user }) => {
  assertThrottle(`lock-remove:${user.id}`, 10);
  const input = await body(req, z.object({ currentPin: z.string().max(8).optional() }));
  const s = await lockSettings(user.id);
  if (!s.appLockPinHash) return { ok: true };
  await assertMayChangePin(s.appLockPinHash, input.currentPin);
  await db.userSettings.update({ where: { userId: user.id }, data: { appLockPinHash: null, appLockMinutes: 0 } });
  return { ok: true };
});
