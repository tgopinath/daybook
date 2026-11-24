import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { throttle } from "@/lib/auth";
import { WhatsAppError, hashCode, newCode, normalizeNumber, sendVerificationCode, whatsappConfigured } from "@/lib/whatsapp";
import { assertWhatsAppAllowed, whatsappState } from "../_shared";

/** Sends a 6-digit code to the number so we know it belongs to this user before messaging it. */
export const POST = route(async ({ req, user }) => {
  assertWhatsAppAllowed(user);
  const { number: raw } = await body(req, z.object({ number: z.string().max(32) }));
  const number = normalizeNumber(raw);
  if (!number) throw new ApiError(400, "Enter the number with its country code, like +91 98765 43210");
  if (!throttle(`wa-code:${user.id}`, 5, 60 * 60_000)) throw new ApiError(429, "Too many codes requested. Try again in an hour.");
  const code = newCode();
  try {
    await sendVerificationCode(number, code);
  } catch (err) {
    if (err instanceof WhatsAppError) throw new ApiError(502, err.message);
    throw err;
  }
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: {
      whatsappNumber: number,
      whatsappVerified: false,
      whatsappReminders: false,
      whatsappCodeHash: hashCode(user.id, number, code),
      whatsappCodeExpires: new Date(Date.now() + 10 * 60_000),
      whatsappCodeAttempts: 0,
    },
  });
  return { configured: whatsappConfigured(), ...whatsappState(updated) };
});
