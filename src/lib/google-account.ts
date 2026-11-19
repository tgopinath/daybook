import "server-only";
import { db } from "./db";
import { DEMO_EMAIL_DOMAIN } from "./demo-mode";
import { GOOGLE_ONLY_PASSWORD, type GoogleProfile } from "./google";
import { isValidTz } from "./time";

/**
 * Finds or creates the account for a verified Google profile:
 * 1. returning Google user → matched by Google id (even if they changed their Google email);
 * 2. existing email/password account with the same verified email → Google is linked to it;
 * 3. otherwise a new account (no password; they can set one later in Settings).
 */
export async function upsertGoogleUser(profile: GoogleProfile, tz: string) {
  const byGoogle = await db.user.findUnique({ where: { googleId: profile.sub } });
  if (byGoogle) return { user: byGoogle, created: false, linked: false };

  if (profile.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) throw new Error("Reserved email domain");
  const byEmail = await db.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    // Google has verified this address, so the person signing in owns the existing account.
    const user = await db.user.update({
      where: { id: byEmail.id },
      data: { googleId: profile.sub, ...(byEmail.avatarUrl ? {} : { avatarUrl: profile.picture }) },
    });
    return { user, created: false, linked: true };
  }

  const user = await db.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      googleId: profile.sub,
      avatarUrl: profile.picture,
      passwordHash: GOOGLE_ONLY_PASSWORD,
      settings: { create: { timezone: isValidTz(tz) ? tz : "UTC" } },
    },
  });
  return { user, created: true, linked: false };
}
