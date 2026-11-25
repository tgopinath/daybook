import { z } from "zod";
import { ApiError, body, route } from "@/lib/api";
import { createSession, throttle } from "@/lib/auth";
import { isDemo } from "@/lib/demo-mode";
import { checkCode, isThrottled, markTicketUsed, recordFailure, redeemBackupCode, remainingBackupCodes, useTicketAttempt } from "@/lib/two-factor";

const schema = z
  .object({
    ticket: z.string().min(10).max(2000),
    code: z.string().max(20).optional(),
    backupCode: z.string().max(40).optional(),
  })
  .refine((v) => !!v.code !== !!v.backupCode, { message: "Enter a code" });

const EXPIRED = "This sign-in has expired. Enter your email and password again.";

/** Second sign-in step: a ticket from POST /api/auth/login plus an authenticator code or a backup code. */
export const POST = route(
  async ({ req }) => {
    if (isDemo()) throw new ApiError(503, "Sign-in is unavailable on this preview.");
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!throttle(`2fa:${ip}`, 30)) throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");
    const input = await body(req, schema);

    const t = await useTicketAttempt(input.ticket);
    if (!t.ok) throw new ApiError(t.reason === "too_many" ? 429 : 401, t.reason === "too_many" ? "Too many incorrect codes. Sign in again." : EXPIRED);
    if (await isThrottled(t.userId)) throw new ApiError(429, "Too many incorrect codes. Try again in an hour.");

    let backupCodesLeft: number | undefined;
    if (input.code) {
      const r = await checkCode(t.userId, input.code);
      if (r === "throttled") throw new ApiError(429, "Too many incorrect codes. Try again in an hour.");
      if (r === "unavailable") throw new ApiError(401, EXPIRED);
      if (r !== "ok") throw new ApiError(400, "That code didn't work. Check your authenticator app and try again.");
    } else {
      if (!(await redeemBackupCode(t.userId, input.backupCode!))) {
        await recordFailure(t.userId);
        throw new ApiError(400, "That backup code didn't work. Each code can be used once.");
      }
      backupCodesLeft = await remainingBackupCodes(t.userId);
    }

    markTicketUsed(t.jti, t.exp);
    await createSession(t.userId);
    return { ok: true, backupCodesLeft };
  },
  { auth: false },
);
