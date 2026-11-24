import "server-only";
import { ApiError } from "@/lib/api";
import { isDemoEmail } from "@/lib/demo-mode";
import { whatsappConfigured } from "@/lib/whatsapp";

/** WhatsApp sends real (paid) messages: never for demo accounts, and only when configured. */
export function assertWhatsAppAllowed(user: { email: string }) {
  if (isDemoEmail(user.email)) throw new ApiError(403, "WhatsApp reminders aren't available in the demo");
  if (!whatsappConfigured()) throw new ApiError(503, "WhatsApp isn't set up on this server yet");
}

/** The parts of the WhatsApp state that are safe to show the user. */
export function whatsappState(s: { whatsappNumber: string | null; whatsappVerified: boolean; whatsappReminders: boolean; whatsappCodeExpires: Date | null }) {
  return {
    number: s.whatsappNumber,
    verified: s.whatsappVerified,
    reminders: s.whatsappReminders,
    codePending: !s.whatsappVerified && !!s.whatsappCodeExpires && s.whatsappCodeExpires > new Date(),
  };
}
