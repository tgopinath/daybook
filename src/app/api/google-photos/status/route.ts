import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { UNAVAILABLE_MESSAGE, unavailableReason } from "../_lib";

/** Whether import can work here and whether the user has a live Google Photos connection. */
export const GET = route(async ({ user }) => {
  const reason = unavailableReason(user);
  const s = await db.userSettings.findUnique({ where: { userId: user.id }, select: { googlePhotosTokenEnc: true, googlePhotosTokenExpires: true } });
  const connected = !!s?.googlePhotosTokenEnc && !!s.googlePhotosTokenExpires && s.googlePhotosTokenExpires > new Date();
  return {
    available: !reason,
    reason,
    message: reason ? UNAVAILABLE_MESSAGE[reason] : null,
    connected: !reason && connected,
    expiresAt: connected ? s!.googlePhotosTokenExpires : null,
  };
});
