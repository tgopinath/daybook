import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Demo mode = no DATABASE_URL. Clear the database and secrets before any module reads them.
const saved = { ...process.env };
process.env.DATABASE_URL = "";
delete process.env.AUTH_SECRET;
delete process.env.VAULT_ENCRYPTION_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

type Mods = {
  db: typeof import("./db")["db"];
  account: typeof import("./demo-account");
  mode: typeof import("./demo-mode");
  crypto: typeof import("./crypto");
  demoDb: typeof import("./demo-db");
};
let m: Mods;

beforeAll(async () => {
  m = {
    db: (await import("./db")).db,
    account: await import("./demo-account"),
    mode: await import("./demo-mode"),
    crypto: await import("./crypto"),
    demoDb: await import("./demo-db"),
  };
});
afterAll(() => {
  process.env = saved;
});

describe("demo mode", () => {
  it("is on only when DATABASE_URL is missing or empty", () => {
    expect(m.mode.isDemo()).toBe(true);
    process.env.DATABASE_URL = "postgres://example.invalid/db";
    expect(m.mode.isDemo()).toBe(false);
    delete process.env.DATABASE_URL;
    expect(m.mode.isDemo()).toBe(true);
    process.env.DATABASE_URL = "";
  });

  it("builds the in-memory schema from every migration", () => {
    const sql = m.demoDb.migrationSql();
    expect(sql).toMatch(/CREATE TABLE "User"/);
    expect(sql).toMatch(/CREATE TABLE "Task"/);
  });

  it("gives each visitor their own fictional sample account", async () => {
    const a = await m.account.createDemoAccount("Asia/Kolkata");
    const b = await m.account.createDemoAccount("UTC");
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe("Alex Rivera");
    expect(a.email.endsWith(`@${m.mode.DEMO_EMAIL_DOMAIN}`)).toBe(true);
    const [tasksA, habitsA, notesA, goalsA] = await Promise.all([
      m.db.task.count({ where: { userId: a.id } }),
      m.db.habit.count({ where: { userId: a.id } }),
      m.db.note.count({ where: { userId: a.id } }),
      m.db.goal.count({ where: { userId: a.id } }),
    ]);
    expect(tasksA).toBeGreaterThan(10);
    expect(habitsA).toBe(5);
    expect(notesA).toBe(4);
    expect(goalsA).toBe(3);
    // Edits stay with their own account.
    await m.db.task.deleteMany({ where: { userId: a.id } });
    expect(await m.db.task.count({ where: { userId: a.id } })).toBe(0);
    expect(await m.db.task.count({ where: { userId: b.id } })).toBe(tasksA); // both sample accounts start with the same tasks
  });

  it("rebuilds a visitor's account on a server instance that hasn't seen it", async () => {
    const tokenHash = "t".repeat(64);
    const cookie = m.account.demoCookieValue("0123456789ab", "Asia/Kolkata");
    expect(m.account.parseDemoCookie(cookie)).toEqual({ key: "0123456789ab", tz: "Asia/Kolkata" });
    expect(m.account.parseDemoCookie("nope")).toBeNull();
    expect(m.account.parseDemoCookie("0123456789ab.Not/AZone")).toBeNull();
    const exp = new Date(Date.now() + 864e5);
    // Two parallel requests share one rebuild.
    const [id1, id2] = await Promise.all([m.account.restoreDemoAccount(cookie, tokenHash, exp), m.account.restoreDemoAccount(cookie, tokenHash, exp)]);
    expect(id1).toBeTruthy();
    expect(id2).toBe(id1);
    expect(await m.db.user.count({ where: { email: { contains: "0123456789ab" } } })).toBe(1);
    expect(await m.db.session.count({ where: { tokenHash } })).toBe(1);
    expect(await m.db.task.count({ where: { userId: id1! } })).toBeGreaterThan(10);
    // A later request finds the same account.
    expect(await m.account.restoreDemoAccount(cookie, tokenHash, exp)).toBe(id1);
    expect(await m.account.restoreDemoAccount("bad", tokenHash, exp)).toBeNull();
  });

  it("encrypts vault items with a per-process demo key", async () => {
    const u = await m.db.user.findFirstOrThrow({ where: { email: { endsWith: `@${m.mode.DEMO_EMAIL_DOMAIN}` } } });
    const item = await m.db.vaultItem.findFirstOrThrow({ where: { userId: u.id } });
    expect(item.fieldsEnc.startsWith("v1.")).toBe(true);
    const fields = m.crypto.decryptJSON<{ label: string }[]>(item.fieldsEnc);
    expect(fields.length).toBeGreaterThan(0);
  });

  it("removes demo accounts after their lifetime", async () => {
    const before = await m.db.user.count();
    expect(before).toBeGreaterThan(0);
    await m.account.pruneDemoAccounts(Date.now() + m.mode.DEMO_TTL_MS + 60_000);
    expect(await m.db.user.count()).toBe(0);
    expect(await m.db.task.count()).toBe(0); // cascades
  });

  it("keeps recent demo accounts when pruning", async () => {
    for (let i = 0; i < 3; i++) await m.db.user.create({ data: { name: "x", email: `old${i}@${m.mode.DEMO_EMAIL_DOMAIN}`, passwordHash: "-", createdAt: new Date(Date.now() - (10 - i) * 1000) } });
    await m.account.pruneDemoAccounts();
    expect(await m.db.user.count()).toBe(3); // well under DEMO_MAX_USERS
  });
});
