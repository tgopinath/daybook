import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { DRIVE_UNAVAILABLE_MESSAGE, driveImportUnavailable, pickerApiKey, pickerAppId } from "../_lib";

const NO_PICKER = "Google Drive import isn't fully set up on this server yet (the Google Picker API key is missing).";

/** Whether Drive import can work here, whether the user is connected, and what the Picker needs. */
export const GET = route(async ({ user }) => {
  const reason = driveImportUnavailable(user) ?? (pickerApiKey() && pickerAppId() ? null : ("no_picker" as const));
  const s = await db.userSettings.findUnique({ where: { userId: user.id }, select: { googleDriveTokenExpires: true, googleDriveTokenEnc: true } });
  const connected = !!s?.googleDriveTokenEnc && !!s.googleDriveTokenExpires && s.googleDriveTokenExpires > new Date();
  return {
    available: !reason,
    reason,
    message: reason ? (reason === "no_picker" ? NO_PICKER : DRIVE_UNAVAILABLE_MESSAGE[reason]) : null,
    connected: !reason && connected,
    expiresAt: !reason && connected ? s!.googleDriveTokenExpires : null,
    appId: reason ? null : pickerAppId(),
  };
});
