import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totp, timeStep } from "./totp";

// Runs against the in-memory database (no DATABASE_URL), like google.test.ts.
const saved = { ...process.env };
process.env.DATABASE_URL = "";

type Mods = { tf: typeof import("./two-factor"); db: typeof import("./db")["db"] };
let m: Mods;
let userId: string;
let secret: string;

beforeAll(async () => {
  m = { tf: await import("./two-factor"), db: (await import("./db")).db };
  const u = await m.db.user.create({ data: { email: "tf@mydiary.test", name: "TF", passwordHash: "$2a$12$abcdefghijklmnopqrstuuS2yNtVNsH3nWJ6p0o9Ct5gXmrqmCq2e" } });
  userId = u.id;
});
afterAll(() => {
  process.env = saved;
});

const T0 = 1_800_000_000_000;
const code = (ms: number) => totp(secret, ms);

describe("setup and verification", () => {
  it("starts a pending setup and enables with a valid code", async () => {
    const s = await m.tf.startSetup(userId, "tf@mydiary.test");
    expect(s).not.toBeNull();
    secret = s!.secret;
    expect(s!.uri).toContain(`secret=${secret}`);
    // a wrong code doesn't enable it
    expect(await m.tf.checkCode(userId, "000000", { pending: true, enable: true, nowMs: T0 })).toBe(code(T0) === "000000" ? "ok" : "invalid");
    // enabled codes don't work against a pending secret
    expect(await m.tf.checkCode(userId, code(T0), { nowMs: T0 })).toBe("unavailable");
    expect(await m.tf.checkCode(userId, code(T0), { pending: true, enable: true, nowMs: T0 })).toBe("ok");
    const u = await m.db.user.findUnique({ where: { id: userId } });
    expect(u?.totpEnabledAt).not.toBeNull();
    expect(u?.totpSecretEnc).not.toContain(secret); // encrypted at rest
    expect(await m.tf.startSetup(userId, "tf@mydiary.test")).toBeNull(); // can't overwrite an enabled secret
  });

  it("rejects replay of an accepted code and older steps", async () => {
    expect(await m.tf.checkCode(userId, code(T0), { nowMs: T0 })).toBe("invalid");
    expect(await m.tf.checkCode(userId, code(T0 - 30_000), { nowMs: T0 })).toBe("invalid");
    // the next step's code works (±1 window), once
    expect(await m.tf.checkCode(userId, code(T0 + 30_000), { nowMs: T0 })).toBe("ok");
    expect(await m.tf.checkCode(userId, code(T0 + 30_000), { nowMs: T0 + 30_000 })).toBe("invalid");
  });

  it("allows ±1 step of clock drift, not more", async () => {
    const t = T0 + 10 * 30_000;
    expect(await m.tf.checkCode(userId, code(t + 60_000), { nowMs: t })).toBe("invalid");
    expect(await m.tf.checkCode(userId, code(t - 30_000), { nowMs: t })).toBe("ok");
  });

  it("only one of two concurrent requests with the same code succeeds", async () => {
    const t = T0 + 20 * 30_000;
    const results = await Promise.all([m.tf.checkCode(userId, code(t), { nowMs: t }), m.tf.checkCode(userId, code(t), { nowMs: t })]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });
});

describe("backup codes", () => {
  it("generates 10 readable codes, stores only hashes, and each works once", async () => {
    const codes = await m.tf.replaceBackupCodes(userId);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    const rows = await m.db.backupCode.findMany({ where: { userId } });
    expect(rows.map((r) => r.codeHash)).not.toContain(codes[0]);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.codeHash))).toBe(true);

    expect(await m.tf.redeemBackupCode(userId, codes[0].toUpperCase().replace("-", " "))).toBe(true);
    expect(await m.tf.redeemBackupCode(userId, codes[0])).toBe(false); // single use
    expect(await m.tf.redeemBackupCode(userId, "aaaaa-aaaaa")).toBe(false);
    expect(await m.tf.remainingBackupCodes(userId)).toBe(9);

    const fresh = await m.tf.replaceBackupCodes(userId);
    expect(await m.tf.redeemBackupCode(userId, codes[1])).toBe(false); // old set is gone
    expect(await m.tf.redeemBackupCode(userId, fresh[0])).toBe(true);
  });
});

describe("sign-in tickets", () => {
  it("round-trips, expires after 5 minutes and rejects tampering", async () => {
    const now = Date.now();
    const t = await m.tf.signTicket(userId, "fp", now);
    expect(await m.tf.readTicket(t, now + 60_000)).toMatchObject({ userId, fp: "fp" });
    expect(await m.tf.readTicket(t, now + 5 * 60_000 + 1000)).toBeNull();
    const [h, p, s] = t.split(".");
    const forged = JSON.parse(Buffer.from(p, "base64url").toString());
    forged.sub = "someone-else";
    expect(await m.tf.readTicket(`${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`, now)).toBeNull();
    expect(await m.tf.readTicket("garbage", now)).toBeNull();
  });

  it("can't be reused once the second step succeeded (state fingerprint)", async () => {
    const ticket = (await m.tf.issueTicket(userId))!;
    const a = await m.tf.useTicketAttempt(ticket);
    expect(a.ok).toBe(true);
    // succeed with a fresh code at the real current time
    const now = T0 + 2 * 3600_000; // later than every earlier step and outside the earlier failure window
    const r = await m.tf.checkCode(userId, totp(secret, now), { nowMs: now });
    expect(r).toBe("ok");
    expect(await m.tf.useTicketAttempt(ticket)).toEqual({ ok: false, reason: "expired_or_used" });
  });

  it("is invalidated by a backup-code sign-in too, and by markTicketUsed", async () => {
    const codes = await m.tf.replaceBackupCodes(userId);
    const ticket = (await m.tf.issueTicket(userId))!;
    expect((await m.tf.useTicketAttempt(ticket)).ok).toBe(true);
    expect(await m.tf.redeemBackupCode(userId, codes[0])).toBe(true);
    expect((await m.tf.useTicketAttempt(ticket)).ok).toBe(false);

    const t2 = (await m.tf.issueTicket(userId))!;
    const c = await m.tf.useTicketAttempt(t2);
    expect(c.ok).toBe(true);
    if (c.ok) m.tf.markTicketUsed(c.jti, c.exp);
    expect((await m.tf.useTicketAttempt(t2)).ok).toBe(false);
  });

  it("allows 5 attempts per ticket", async () => {
    const ticket = (await m.tf.issueTicket(userId))!;
    for (let i = 0; i < 5; i++) expect((await m.tf.useTicketAttempt(ticket)).ok).toBe(true);
    expect(await m.tf.useTicketAttempt(ticket)).toEqual({ ok: false, reason: "too_many" });
  });
});

describe("per-user hourly limit", () => {
  it("locks code checks after 20 failures in an hour, even with the right code", async () => {
    const t = T0 + 5 * 3600_000; // a fresh hour: earlier failures no longer count
    for (let i = 0; i < 20; i++) expect(await m.tf.checkCode(userId, "999999" === code(t) ? "888888" : "999999", { nowMs: t })).toBe("invalid");
    expect(await m.tf.isThrottled(userId, t)).toBe(true);
    expect(await m.tf.checkCode(userId, code(t), { nowMs: t })).toBe("throttled");
    // an hour later it works again
    const later = t + 3600_000 + 1000;
    expect(await m.tf.checkCode(userId, code(later), { nowMs: later })).toBe("ok");
    expect(timeStep(later)).toBeGreaterThan(timeStep(t));
  });

  it("turns off cleanly", async () => {
    await m.tf.disableTwoFactor(userId);
    const u = await m.db.user.findUnique({ where: { id: userId } });
    expect(u?.totpSecretEnc).toBeNull();
    expect(u?.totpEnabledAt).toBeNull();
    expect(await m.tf.remainingBackupCodes(userId)).toBe(0);
    expect(await m.tf.issueTicket(userId)).toBeNull();
  });
});
