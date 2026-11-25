import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { isDemoEmail } from "@/lib/demo-mode";
import { hasPassword } from "@/lib/google";
import { BACKUP_CODE_COUNT } from "@/lib/two-factor";

/** My Security overview. Never returns secrets, hashes or codes. */
export const GET = route(async ({ user }) => {
  const [row, settings, backupLeft, backupTotal, vaultCount, sessionCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, googleId: true, totpEnabledAt: true } }),
    db.userSettings.findUnique({ where: { userId: user.id }, select: { appLockPinHash: true, appLockMinutes: true } }),
    db.backupCode.count({ where: { userId: user.id, usedAt: null } }),
    db.backupCode.count({ where: { userId: user.id } }),
    db.vaultItem.count({ where: { userId: user.id, deletedAt: null } }),
    db.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);
  const lockOn = !!settings?.appLockPinHash;
  return {
    hasPassword: !!row && hasPassword(row.passwordHash),
    google: !!row?.googleId,
    demo: isDemoEmail(user.email),
    twoFactor: { enabled: !!row?.totpEnabledAt, enabledAt: row?.totpEnabledAt ?? null },
    backupCodes: { remaining: backupLeft, total: backupTotal || BACKUP_CODE_COUNT },
    appLock: { enabled: lockOn, minutes: lockOn ? settings!.appLockMinutes : 0 },
    vaultCount,
    sessionCount,
  };
});
