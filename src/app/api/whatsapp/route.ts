import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { whatsappConfigured } from "@/lib/whatsapp";
import { assertWhatsAppAllowed, whatsappState } from "./_shared";

const getSettings = (userId: string) => db.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });

/** WhatsApp status for Settings. */
export const GET = route(async ({ user }) => {
  return { configured: whatsappConfigured(), ...whatsappState(await getSettings(user.id)) };
});

/** Turn WhatsApp reminders on/off for a verified number. */
export const PATCH = route(async ({ req, user }) => {
  const { reminders } = await body(req, z.object({ reminders: z.boolean() }));
  const s = await getSettings(user.id);
  if (reminders) {
    assertWhatsAppAllowed(user);
    if (!s.whatsappVerified) throw new ApiError(400, "Verify your WhatsApp number first");
  }
  const updated = await db.userSettings.update({ where: { userId: user.id }, data: { whatsappReminders: reminders } });
  return { configured: whatsappConfigured(), ...whatsappState(updated) };
});

/** Removes the number and stops WhatsApp messages. */
export const DELETE = route(async ({ user }) => {
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: { whatsappNumber: null, whatsappVerified: false, whatsappReminders: false, whatsappCodeHash: null, whatsappCodeExpires: null, whatsappCodeAttempts: 0 },
  });
  return { configured: whatsappConfigured(), ...whatsappState(updated) };
});
