import type { UserSettings } from "@prisma/client";

/** UserSettings without server-only fields (pending WhatsApp code, Google Photos token). */
export function publicSettings(s: UserSettings) {
  const { whatsappCodeHash: _h, whatsappCodeAttempts: _a, googlePhotosTokenEnc: _t, googlePhotosTokenExpires: _e, ...rest } = s;
  return rest;
}
