import type { UserSettings } from "@prisma/client";

/** UserSettings without server-only fields (the pending WhatsApp code). */
export function publicSettings(s: UserSettings) {
  const { whatsappCodeHash: _h, whatsappCodeAttempts: _a, ...rest } = s;
  return rest;
}
