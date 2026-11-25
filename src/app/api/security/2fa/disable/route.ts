import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { checkCode, disableTwoFactor } from "@/lib/two-factor";
import { assertThrottle, confirmPassword } from "../../guard";

const schema = z.object({ password: z.string().max(200).optional(), code: z.string().max(20).optional() });

/** Turns 2FA off. Confirm with the account password, or a current code (accounts without a password must use a code). */
export const POST = route(async ({ req, user }) => {
  assertThrottle(`2fa-disable:${user.id}`, 8);
  const input = await body(req, schema);
  const row = await db.user.findUnique({ where: { id: user.id }, select: { totpEnabledAt: true } });
  if (!row?.totpEnabledAt) throw new ApiError(409, "Two-step verification is already off");
  if (input.code) {
    const r = await checkCode(user.id, input.code);
    if (r === "throttled") throw new ApiError(429, "Too many incorrect codes. Try again in an hour.");
    if (r !== "ok") throw new ApiError(400, "That code didn't work");
  } else {
    const hasPw = await confirmPassword(user.id, input.password, { required: true });
    if (!hasPw) throw new ApiError(400, "Enter a code from your authenticator app");
  }
  await disableTwoFactor(user.id);
  return { ok: true };
});
