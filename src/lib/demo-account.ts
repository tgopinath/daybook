import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";
import { seedDemoData } from "./demo";
import { DEMO_EMAIL_DOMAIN, DEMO_MAX_USERS, DEMO_NAME, DEMO_TTL_MS } from "./demo-mode";

const demoUsers = { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } };

/** Removes demo accounts past their lifetime, then the oldest ones beyond the cap (making room for one more). */
export async function pruneDemoAccounts(now = Date.now()) {
  await db.user.deleteMany({ where: { ...demoUsers, createdAt: { lt: new Date(now - DEMO_TTL_MS) } } });
  const over = (await db.user.count({ where: demoUsers })) - (DEMO_MAX_USERS - 1);
  if (over > 0) {
    const oldest = await db.user.findMany({ where: demoUsers, orderBy: { createdAt: "asc" }, take: over, select: { id: true } });
    await db.user.deleteMany({ where: { id: { in: oldest.map((u) => u.id) } } });
  }
}

/** A new fictional sample account (Alex Rivera) with the full sample data set. */
export async function createDemoAccount(tz: string) {
  const user = await db.user.create({
    data: {
      name: DEMO_NAME,
      email: `alex.${randomBytes(6).toString("hex")}@${DEMO_EMAIL_DOMAIN}`,
      // Not a bcrypt hash, so no password can ever sign in to a demo account.
      passwordHash: "demo-account-no-password",
      settings: { create: { timezone: tz } },
    },
  });
  await seedDemoData(user.id, tz);
  return user;
}
