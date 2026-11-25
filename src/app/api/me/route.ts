import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { hasDemoData } from "@/lib/demo";
import { isDemoEmail } from "@/lib/demo-mode";
import { hasPassword } from "@/lib/google";
import { publicSettings } from "@/lib/public-settings";
import { whatsappConfigured } from "@/lib/whatsapp";

export const GET = route(async ({ user }) => {
  const settings = await db.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const auth = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, googleId: true, totpEnabledAt: true } });
  return {
    user,
    settings: publicSettings(settings),
    whatsappAvailable: whatsappConfigured(),
    hasDemoData: await hasDemoData(user.id),
    account: {
      hasPassword: !!auth && hasPassword(auth.passwordHash),
      google: !!auth?.googleId,
      demo: isDemoEmail(user.email),
      twoFactor: !!auth?.totpEnabledAt,
    },
    // App lock timeout in minutes; 0 = off (no PIN). The PIN hash never leaves the server.
    appLock: settings.appLockPinHash ? settings.appLockMinutes : 0,
  };
});
