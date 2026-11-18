import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";
import { seedDemoData } from "./demo";
import { DEMO_EMAIL_DOMAIN, DEMO_MAX_USERS, DEMO_NAME, DEMO_TTL_MS } from "./demo-mode";
import { isValidTz } from "./time";

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

export const newDemoKey = () => randomBytes(6).toString("hex");
const demoEmail = (key: string) => `alex.rivera.${key}@${DEMO_EMAIL_DOMAIN}`;

/** "<key>.<timezone>" for the demo cookie, and back. */
export const demoCookieValue = (key: string, tz: string) => `${key}.${tz}`;
export function parseDemoCookie(value: string | undefined) {
  const m = value?.match(/^([0-9a-f]{12})\.(.{1,64})$/);
  return m && isValidTz(m[2]!) ? { key: m[1]!, tz: m[2]! } : null;
}

/** A new fictional sample account (Alex Rivera) with the full sample data set. */
export async function createDemoAccount(tz: string, key = newDemoKey()) {
  const user = await db.user.create({
    data: {
      name: DEMO_NAME,
      email: demoEmail(key),
      // Not a bcrypt hash, so no password can ever sign in to a demo account.
      passwordHash: "demo-account-no-password",
      settings: { create: { timezone: tz } },
    },
  });
  await seedDemoData(user.id, tz);
  return user;
}

// One rebuild per account at a time in this process (parallel requests share it).
const restoring = new Map<string, Promise<string | null>>();

/**
 * Demo mode runs one in-memory database per server instance. When a request reaches an instance that
 * hasn't seen this browser's account yet (or the account expired), rebuild it from the demo cookie with
 * fresh sample data and attach the browser's session token to it. Returns the user id.
 */
export function restoreDemoAccount(cookie: string | undefined, tokenHash: string, expiresAt: Date) {
  const parsed = parseDemoCookie(cookie);
  if (!parsed) return Promise.resolve(null);
  const inflight = restoring.get(parsed.key);
  if (inflight) return inflight;
  const job = (async () => {
    const user = (await db.user.findUnique({ where: { email: demoEmail(parsed.key) } })) ?? (await createDemoAccount(parsed.tz, parsed.key));
    await db.session.upsert({ where: { tokenHash }, update: {}, create: { userId: user.id, tokenHash, expiresAt } });
    return user.id;
  })().finally(() => restoring.delete(parsed.key));
  restoring.set(parsed.key, job);
  return job;
}
