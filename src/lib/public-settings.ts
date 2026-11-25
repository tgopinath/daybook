import type { UserSettings } from "@prisma/client";

/** UserSettings without server-only fields (pending WhatsApp code, Google tokens, app-lock PIN hash). */
export function publicSettings(s: UserSettings) {
  const { whatsappCodeHash: _h, whatsappCodeAttempts: _a, googlePhotosTokenEnc: _t, googlePhotosTokenExpires: _e, googleDriveTokenEnc: _d, googleDriveTokenExpires: _de, appLockPinHash: _p, ...rest } = s;
  return rest;
}
