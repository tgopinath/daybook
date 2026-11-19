import "server-only";
import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Google sign-in with the OAuth 2.0 authorization-code flow (server side, PKCE + state + nonce).
// The browser only ever sees Google's consent page and our callback; the client secret and the
// tokens stay on the server. Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const OAUTH_COOKIE = "pad_oauth";
export const CALLBACK_PATH = "/api/auth/google/callback";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleConfigured = () => googleConfig() !== null;

/** Absolute callback URL. APP_URL wins (set it in production); otherwise derived from the request. */
export function redirectUri(req: { headers: Headers; nextUrl: URL }) {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return base + CALLBACK_PATH;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${CALLBACK_PATH}`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** One-time values for a sign-in attempt; kept in an httpOnly cookie until the callback. */
export function newOAuthAttempt(next: string, tz: string) {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(16)),
    nonce: b64url(randomBytes(16)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
    next,
    tz,
  };
}
export type OAuthAttempt = ReturnType<typeof newOAuthAttempt>;

export function authorizationUrl(a: OAuthAttempt, clientId: string, redirect: string) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email profile",
    state: a.state,
    nonce: a.nonce,
    code_challenge: a.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export class GoogleAuthError extends Error {
  constructor(public code: "exchange_failed" | "invalid_token" | "email_unverified") {
    super(code);
  }
}

/** Exchanges the authorization code for tokens and returns the raw ID token. */
export async function exchangeCode(code: string, verifier: string, redirect: string, cfg: { clientId: string; clientSecret: string }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.id_token) {
    console.error("[google] token exchange failed", res.status, json.error, json.error_description);
    throw new GoogleAuthError("exchange_failed");
  }
  return json.id_token;
}

export type GoogleProfile = { sub: string; email: string; name: string; picture: string | null };

let jwks: JWTVerifyGetKey | null = null;

/**
 * Verifies a Google ID token: signature (Google's published keys), issuer, audience, expiry,
 * nonce and a verified email. `keys` is injectable for tests.
 */
export async function verifyIdToken(idToken: string, opts: { clientId: string; nonce: string; keys?: JWTVerifyGetKey }): Promise<GoogleProfile> {
  const keys = opts.keys ?? (jwks ??= createRemoteJWKSet(JWKS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience: opts.clientId, clockTolerance: 60 }));
  } catch (err) {
    console.error("[google] ID token rejected", (err as Error).message);
    throw new GoogleAuthError("invalid_token");
  }
  if (payload.nonce !== opts.nonce || typeof payload.sub !== "string" || typeof payload.email !== "string") throw new GoogleAuthError("invalid_token");
  if (payload.email_verified !== true && payload.email_verified !== "true") throw new GoogleAuthError("email_unverified");
  const email = payload.email.trim().toLowerCase();
  const name = (typeof payload.name === "string" && payload.name.trim()) || email.split("@")[0]!;
  const picture = typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null;
  return { sub: payload.sub, email, name: name.slice(0, 80), picture };
}

/** Marker stored as passwordHash for accounts created through Google (never a valid bcrypt hash). */
export const GOOGLE_ONLY_PASSWORD = "google-oauth-no-password";

export const hasPassword = (passwordHash: string) => passwordHash.startsWith("$2");
