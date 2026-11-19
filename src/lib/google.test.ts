import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";

// Runs against the in-memory database (no DATABASE_URL), like demo-mode.test.ts.
const saved = { ...process.env };
process.env.DATABASE_URL = "";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
type Mods = { google: typeof import("./google"); account: typeof import("./google-account"); db: typeof import("./db")["db"]; auth: typeof import("./auth") };
let m: Mods;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey as CryptoKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });
  m = { google: await import("./google"), account: await import("./google-account"), db: (await import("./db")).db, auth: await import("./auth") };
});
afterAll(() => {
  process.env = saved;
});

function token(claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT({ email_verified: true, nonce: "n1", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? "https://accounts.google.com")
    .setAudience(opts.aud ?? CLIENT_ID)
    .setSubject(String(claims.sub ?? "g-123"))
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(privateKey);
}

const verify = (t: string, nonce = "n1") => m.google.verifyIdToken(t, { clientId: CLIENT_ID, nonce, keys });

describe("Google ID token verification", () => {
  it("accepts a valid token and normalises the profile", async () => {
    const p = await verify(await token({ sub: "g-1", email: "Sam@Example.com", name: "Sam Lee", picture: "https://lh3.googleusercontent.com/a" }));
    expect(p).toEqual({ sub: "g-1", email: "sam@example.com", name: "Sam Lee", picture: "https://lh3.googleusercontent.com/a" });
  });

  it("rejects the wrong audience, issuer, nonce, expiry and unverified emails", async () => {
    await expect(verify(await token({ email: "a@b.co" }, { aud: "someone-else" }))).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verify(await token({ email: "a@b.co" }, { iss: "https://evil.example" }))).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verify(await token({ email: "a@b.co" }), "other-nonce")).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verify(await token({ email: "a@b.co" }, { exp: "-10m" }))).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verify(await token({ email: "a@b.co", email_verified: false }))).rejects.toMatchObject({ code: "email_unverified" });
  });

  it("rejects a token signed by another key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "a@b.co", email_verified: true, nonce: "n1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setSubject("g-x")
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(verify(forged)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("builds a PKCE authorization URL", () => {
    const a = m.google.newOAuthAttempt("/overview", "UTC");
    const url = new URL(m.google.authorizationUrl(a, CLIENT_ID, "https://app.example/api/auth/google/callback"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(a.state);
    expect(url.searchParams.get("nonce")).toBe(a.nonce);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });
});

describe("Google accounts", () => {
  it("creates a new user on first sign-in, then finds the same user again", async () => {
    const profile = { sub: "g-new", email: "new@example.com", name: "New Person", picture: null };
    const first = await m.account.upsertGoogleUser(profile, "Asia/Kolkata");
    expect(first.created).toBe(true);
    expect(first.user.googleId).toBe("g-new");
    expect(m.google.hasPassword(first.user.passwordHash)).toBe(false);
    expect(await m.auth.verifyPassword("anything", first.user.passwordHash)).toBe(false);
    expect((await m.db.userSettings.findUnique({ where: { userId: first.user.id } }))?.timezone).toBe("Asia/Kolkata");

    // Returning user, even after changing their Google email.
    const again = await m.account.upsertGoogleUser({ ...profile, email: "renamed@example.com" }, "UTC");
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(first.user.id);
    expect(await m.db.user.count({ where: { googleId: "g-new" } })).toBe(1);
  });

  it("links Google to an existing email/password account and keeps the password", async () => {
    const hash = await m.auth.hashPassword("correct horse");
    const existing = await m.db.user.create({ data: { name: "Existing", email: "existing@example.com", passwordHash: hash } });
    const r = await m.account.upsertGoogleUser({ sub: "g-link", email: "existing@example.com", name: "Existing", picture: "https://x/p" }, "UTC");
    expect(r.linked).toBe(true);
    expect(r.user.id).toBe(existing.id);
    expect(r.user.googleId).toBe("g-link");
    expect(r.user.avatarUrl).toBe("https://x/p");
    expect(await m.auth.verifyPassword("correct horse", r.user.passwordHash)).toBe(true);
  });

  it("never links to a demo account's reserved domain", async () => {
    const { DEMO_EMAIL_DOMAIN } = await import("./demo-mode");
    await expect(m.account.upsertGoogleUser({ sub: "g-d", email: `x@${DEMO_EMAIL_DOMAIN}`, name: "x", picture: null }, "UTC")).rejects.toThrow();
  });
});
