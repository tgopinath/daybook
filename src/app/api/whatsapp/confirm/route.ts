import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { codeMatches, whatsappConfigured } from "@/lib/whatsapp";
import { assertWhatsAppAllowed, whatsappState } from "../_shared";

const MAX_ATTEMPTS = 5;

/** Checks the code; on success the number is verified and WhatsApp reminders are switched on. */
export const POST = route(async ({ req, user }) => {
  assertWhatsAppAllowed(user);
  const { code } = await body(req, z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }));
  const s = await db.userSettings.findUnique({ where: { userId: user.id } });
  if (!s?.whatsappNumber || !s.whatsappCodeHash || !s.whatsappCodeExpires) throw new ApiError(400, "Request a code first");
  if (s.whatsappCodeExpires < new Date()) throw new ApiError(400, "That code has expired. Request a new one.");
  if (s.whatsappCodeAttempts >= MAX_ATTEMPTS) throw new ApiError(429, "Too many wrong codes. Request a new one.");
  if (!codeMatches(s.whatsappCodeHash, user.id, s.whatsappNumber, code)) {
    await db.userSettings.update({ where: { userId: user.id }, data: { whatsappCodeAttempts: { increment: 1 } } });
    throw new ApiError(400, "That code isn't right");
  }
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: { whatsappVerified: true, whatsappReminders: true, whatsappCodeHash: null, whatsappCodeExpires: null, whatsappCodeAttempts: 0 },
  });
  return { configured: whatsappConfigured(), ...whatsappState(updated) };
});
