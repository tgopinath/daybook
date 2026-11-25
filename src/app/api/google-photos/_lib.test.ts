import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the in-memory database (no DATABASE_URL), like src/lib/google.test.ts.
const saved = { ...process.env };
process.env.DATABASE_URL = "";
process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "secret";

type Mods = { lib: typeof import("./_lib"); gp: typeof import("@/lib/google-photos"); db: typeof import("@/lib/db")["db"] };
let m: Mods;
let userId: string;

beforeAll(async () => {
  m = { lib: await import("./_lib"), gp: await import("@/lib/google-photos"), db: (await import("@/lib/db")).db };
  const u = await m.db.user.create({ data: { email: "gp-test@example.com", name: "GP", passwordHash: "x" } });
  userId = u.id;
});
afterAll(async () => {
  await m.db.user.deleteMany({ where: { id: userId } });
  process.env = saved;
});

describe("Google Photos connection", () => {
  it("answers 401 { reconnect: true } when there's no token", async () => {
    expect(await m.lib.readToken(userId)).toBeNull();
    const err = await m.lib.requireToken(userId).catch((e) => e);
    const res = await m.lib.gpErrorResponse(err, userId);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });

  it("stores the token encrypted and treats expired tokens as missing", async () => {
    await m.lib.saveToken(userId, "ya29.secret", new Date(Date.now() + 60_000));
    const row = await m.db.userSettings.findUnique({ where: { userId } });
    expect(row?.googlePhotosTokenEnc).toBeTruthy();
    expect(row?.googlePhotosTokenEnc).not.toContain("ya29");
    expect(await m.lib.requireToken(userId)).toBe("ya29.secret");
    await m.lib.saveToken(userId, "ya29.old", new Date(Date.now() - 1000));
    expect(await m.lib.readToken(userId)).toBeNull();
  });

  it("forgets the token when Google says access lapsed", async () => {
    await m.lib.saveToken(userId, "ya29.revoked", new Date(Date.now() + 60_000));
    const res = await m.lib.gpErrorResponse(m.gp.googleError(401, { error: { message: "Invalid Credentials" } }), userId);
    expect(res.status).toBe(401);
    expect(await m.lib.readToken(userId)).toBeNull();
    const other = await m.lib.gpErrorResponse(m.gp.googleError(400, { error: { message: "Bad session" } }), userId);
    expect(other.status).toBe(400);
    expect(await other.json()).toEqual({ error: "Google Photos: Bad session" });
  });

  it("is unavailable for demo accounts", () => {
    expect(m.lib.unavailableReason({ email: "x@demo.mydiary.invalid" })).toBe("demo");
  });
});
