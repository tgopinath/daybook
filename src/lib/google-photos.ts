import "server-only";
import { createHash, randomBytes } from "crypto";

// Google Photos Picker API (https://developers.google.com/photos/picker).
// The Library API can no longer read a user's library, so the user picks items in Google's own
// picker UI and we download only those. Flow:
//   1. OAuth (authorization code + PKCE) for the photospicker.mediaitems.readonly scope → access token
//   2. POST /v1/sessions → { id, pickerUri }; the user picks in a new tab (pickerUri + "/autoclose")
//   3. poll GET /v1/sessions/{id} until mediaItemsSet
//   4. GET /v1/mediaItems?sessionId=… (paginated) → download each baseUrl with the bearer token
//   5. DELETE /v1/sessions/{id}
// Everything here is pure (no database) so it can be unit-tested with a mocked fetch.

export const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
export const PICKER_API = "https://photospicker.googleapis.com/v1";
export const GP_CALLBACK_PATH = "/api/google-photos/callback";
export const GP_COOKIE = "pad_gp_oauth";
export const GP_COOKIE_PATH = "/api/google-photos";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Items imported per request, so each call finishes well inside serverless time limits. */
export const IMPORT_BATCH = 10;

type Fetch = typeof fetch;
type Cfg = { clientId: string; clientSecret: string };

// ------------------------------------------------------------------ OAuth

export function gpRedirectUri(req: { headers: Headers; nextUrl: URL }) {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return base + GP_CALLBACK_PATH;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${GP_CALLBACK_PATH}`;
}

/** Only same-app pages may be returned to after connecting. */
export function safeReturnPath(raw: string | null | undefined, fallback = "/photos") {
  const v = raw ?? "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/api/") || v.includes("\\")) return fallback;
  return v;
}

export function newGpAttempt(userId: string, returnTo: string) {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(16).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    userId,
    returnTo,
  };
}
export type GpAttempt = ReturnType<typeof newGpAttempt>;

export function gpAuthorizationUrl(a: Pick<GpAttempt, "state" | "challenge">, clientId: string, redirect: string, email?: string) {
  const url = new URL(AUTH_URL);
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: PICKER_SCOPE,
    include_granted_scopes: "true",
    access_type: "online",
    state: a.state,
    code_challenge: a.challenge,
    code_challenge_method: "S256",
  };
  if (email) params.login_hint = email;
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

export class GooglePhotosError extends Error {
  constructor(
    public status: number,
    message: string,
    public reconnect = false,
  ) {
    super(message);
  }
}

/** Exchanges the authorization code for an access token that carries the picker scope. */
export async function exchangePickerCode(code: string, verifier: string, redirect: string, cfg: Cfg, f: Fetch = fetch) {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new GooglePhotosError(502, json.error_description || json.error || "Google didn't return an access token");
  const scopes = (json.scope ?? "").split(/\s+/);
  if (json.scope && !scopes.includes(PICKER_SCOPE)) throw new GooglePhotosError(403, "Access to pick Google Photos wasn't granted");
  const expiresIn = Math.max(60, Number(json.expires_in) || 3600);
  // Treat the token as expired a minute early so a request never starts with a token about to lapse.
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000) };
}

// ------------------------------------------------------------------ Picker API

/** Calls the Picker API; maps Google's errors to GooglePhotosError (401 → reconnect). */
export async function pickerFetch<T>(token: string, path: string, init: RequestInit = {}, f: Fetch = fetch): Promise<T> {
  const res = await f(path.startsWith("http") ? path : `${PICKER_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 204) return {} as T;
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw googleError(res.status, json);
  return json as T;
}

export function googleError(status: number, json: unknown) {
  const err = (json as { error?: { message?: string; status?: string } | string })?.error;
  const message = typeof err === "string" ? err : err?.message;
  if (status === 401) return new GooglePhotosError(401, "Your Google Photos connection expired. Connect again to continue.", true);
  if (status === 403 && /scope|permission/i.test(message ?? "")) return new GooglePhotosError(401, "Google Photos access wasn't granted. Connect again to continue.", true);
  if (status === 403 && /not been used|disabled/i.test(message ?? "")) return new GooglePhotosError(503, "The Google Photos Picker API isn't enabled for this app yet.");
  if (status === 429) return new GooglePhotosError(429, "Google Photos is busy right now. Wait a moment and try again.");
  return new GooglePhotosError(status >= 500 ? 502 : status, message ? `Google Photos: ${message}` : `Google Photos request failed (${status})`);
}

/** "5s" / "1.5s" / "1800s" (protobuf Duration) → milliseconds. */
export function parseDuration(v: unknown, fallbackMs: number) {
  if (typeof v !== "string") return fallbackMs;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
  return m ? Math.round(Number(m[1]) * 1000) : fallbackMs;
}

export type PickerSession = { id: string; pickerUri: string; mediaItemsSet: boolean; pollIntervalMs: number; timeoutMs: number; expireTime: string | null };

export function parseSession(json: unknown): PickerSession {
  const j = (json ?? {}) as { id?: unknown; pickerUri?: unknown; mediaItemsSet?: unknown; expireTime?: unknown; pollingConfig?: { pollInterval?: unknown; timeoutIn?: unknown } };
  if (typeof j.id !== "string" || !j.id) throw new GooglePhotosError(502, "Google Photos returned an unexpected session");
  return {
    id: j.id,
    pickerUri: typeof j.pickerUri === "string" ? j.pickerUri : "",
    mediaItemsSet: j.mediaItemsSet === true,
    // Never poll faster than every 2 s, whatever the config says.
    pollIntervalMs: Math.max(2000, parseDuration(j.pollingConfig?.pollInterval, 5000)),
    timeoutMs: parseDuration(j.pollingConfig?.timeoutIn, 30 * 60_000),
    expireTime: typeof j.expireTime === "string" ? j.expireTime : null,
  };
}

/** Browser URL for the picker: "/autoclose" closes Google's tab once the user is done. */
export function pickerWindowUrl(pickerUri: string) {
  return pickerUri.replace(/\/+$/, "") + "/autoclose";
}

export type PickedItem = {
  id: string;
  type: "PHOTO" | "VIDEO";
  createTime: string | null;
  baseUrl: string;
  mimeType: string;
  filename: string | null;
  width: number | null;
  height: number | null;
  videoReady: boolean;
};

export function parseMediaItems(json: unknown): { items: PickedItem[]; nextPageToken: string | null } {
  const j = (json ?? {}) as { mediaItems?: unknown[]; nextPageToken?: unknown };
  const items: PickedItem[] = [];
  for (const raw of j.mediaItems ?? []) {
    const r = raw as {
      id?: unknown;
      type?: unknown;
      createTime?: unknown;
      mediaFile?: { baseUrl?: unknown; mimeType?: unknown; filename?: unknown; mediaFileMetadata?: { width?: unknown; height?: unknown; videoMetadata?: { processingStatus?: unknown } } };
    };
    const mf = r.mediaFile;
    if (typeof r.id !== "string" || typeof mf?.baseUrl !== "string" || !mf.baseUrl.startsWith("https://")) continue;
    const mimeType = typeof mf.mimeType === "string" ? mf.mimeType.toLowerCase() : "";
    const type = r.type === "VIDEO" || mimeType.startsWith("video/") ? "VIDEO" : "PHOTO";
    const meta = mf.mediaFileMetadata;
    const status = meta?.videoMetadata?.processingStatus;
    items.push({
      id: r.id,
      type,
      createTime: typeof r.createTime === "string" && !Number.isNaN(Date.parse(r.createTime)) ? r.createTime : null,
      baseUrl: mf.baseUrl,
      mimeType,
      filename: typeof mf.filename === "string" ? mf.filename.slice(0, 255) : null,
      width: toInt(meta?.width),
      height: toInt(meta?.height),
      videoReady: type !== "VIDEO" || status === undefined || status === "READY",
    });
  }
  return { items, nextPageToken: typeof j.nextPageToken === "string" && j.nextPageToken ? j.nextPageToken : null };
}

function toInt(v: unknown) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** All picked items of a session (follows nextPageToken; capped as a safety net). */
export async function listPickedItems(token: string, sessionId: string, f: Fetch = fetch, maxPages = 20) {
  const all: PickedItem[] = [];
  let pageToken: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const qs = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = parseMediaItems(await pickerFetch(token, `/mediaItems?${qs}`, {}, f));
    all.push(...page.items);
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

/**
 * Download URL for a picked item: photos at most 2560px on the long edge (what our own uploads
 * use), videos as the playable file (`=dv`). Base URLs require the bearer token.
 */
export function downloadUrl(item: Pick<PickedItem, "baseUrl" | "type">) {
  return item.baseUrl + (item.type === "VIDEO" ? "=dv" : "=w2560-h2560");
}

/** Mime type of a downloaded file: what Google sent, else the item's own type. Resized photos arrive as JPEG. */
export function downloadedMime(item: Pick<PickedItem, "mimeType" | "type">, contentType: string | null) {
  const header = contentType?.split(";")[0]?.trim().toLowerCase();
  if (header && header !== "application/octet-stream" && header !== "binary/octet-stream") return header;
  if (item.mimeType) return item.mimeType;
  return item.type === "VIDEO" ? "video/mp4" : "image/jpeg";
}

/** Splits picked items into ones already imported (by Google id) and new ones (deduped within the pick too). */
export function partitionImported(items: PickedItem[], existingSourceIds: Iterable<string>) {
  const known = new Set(existingSourceIds);
  const seen = new Set<string>();
  const existing: PickedItem[] = [];
  const fresh: PickedItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    (known.has(it.id) ? existing : fresh).push(it);
  }
  return { existing, fresh };
}

/** Downloads one item's bytes, refusing anything over `maxBytes`. */
export async function downloadItem(token: string, item: PickedItem, maxBytes: number, f: Fetch = fetch) {
  const res = await f(downloadUrl(item), { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "follow" });
  if (!res.ok) throw googleError(res.status, await res.json().catch(() => ({})));
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > maxBytes) throw new GooglePhotosError(413, `${item.filename ?? "This item"} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new GooglePhotosError(502, `${item.filename ?? "An item"} downloaded empty`);
  if (bytes.length > maxBytes) throw new GooglePhotosError(413, `${item.filename ?? "This item"} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  return { bytes, mimeType: downloadedMime(item, res.headers.get("content-type")) };
}
