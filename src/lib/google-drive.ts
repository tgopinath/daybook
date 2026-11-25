import "server-only";
import { createHash, randomBytes } from "crypto";

// Google Drive import for My Storage (and the token the Sheets export shares).
// Scope: drive.file only — the app can read just the files the user picks in Google's Picker
// (or files it creates itself). It's a non-sensitive scope: no access to the rest of the Drive.
// Flow:
//   1. OAuth (authorization code + PKCE, state in an httpOnly cookie) → short-lived access token,
//      stored encrypted in UserSettings.googleDriveTokenEnc/Expires
//   2. Browser opens the Google Picker with that token (GET /api/google-drive/token); picking grants
//      drive.file access to those file ids
//   3. POST /api/google-drive/import { fileIds } → metadata, download (`alt=media`) or export
//      (Docs/Sheets/Slides → DOCX/XLSX/PPTX, Drawings → PDF), then stored like any upload.
// Everything here is pure (no database) so it can be unit-tested with a mocked fetch.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const GD_CALLBACK_PATH = "/api/google-drive/callback";
export const GD_COOKIE = "pad_gd_oauth";
export const GD_COOKIE_PATH = "/api/google-drive";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** New downloads per import request, so each call finishes well inside serverless time limits. */
export const DRIVE_IMPORT_BATCH = 10;
/** Google refuses to export native documents larger than this. */
export const EXPORT_LIMIT_BYTES = 10 * 1024 * 1024;

type Fetch = typeof fetch;
type Cfg = { clientId: string; clientSecret: string };

// ------------------------------------------------------------------ OAuth

export function gdRedirectUri(req: { headers: Headers; nextUrl: URL }) {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return base + GD_CALLBACK_PATH;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${GD_CALLBACK_PATH}`;
}

/** Only same-app pages may be returned to after connecting. */
export function safeDriveReturn(raw: string | null | undefined, fallback = "/drive") {
  const v = raw ?? "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/api/") || v.includes("\\") || v.length > 300) return fallback;
  return v;
}

export function newGdAttempt(userId: string, returnTo: string) {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(16).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    userId,
    returnTo,
  };
}
export type GdAttempt = ReturnType<typeof newGdAttempt>;

export function gdAuthorizationUrl(a: Pick<GdAttempt, "state" | "challenge">, clientId: string, redirect: string, email?: string) {
  const url = new URL(AUTH_URL);
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: DRIVE_SCOPE,
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

/** Google Cloud project number = the numeric prefix of the OAuth client id ("1234-abc.apps.googleusercontent.com"). */
export function projectNumberFromClientId(clientId: string | null | undefined) {
  const m = /^(\d+)-/.exec(clientId?.trim() ?? "");
  return m ? m[1]! : null;
}

export class GoogleDriveError extends Error {
  constructor(
    public status: number,
    message: string,
    public reconnect = false,
  ) {
    super(message);
  }
}

/** Exchanges the authorization code for an access token carrying the drive.file scope. */
export async function exchangeDriveCode(code: string, verifier: string, redirect: string, cfg: Cfg, f: Fetch = fetch) {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new GoogleDriveError(502, json.error_description || json.error || "Google didn't return an access token");
  if (json.scope && !json.scope.split(/\s+/).includes(DRIVE_SCOPE)) throw new GoogleDriveError(403, "Access to the Google Drive files you pick wasn't granted");
  const expiresIn = Math.max(120, Number(json.expires_in) || 3600);
  // Treat the token as expired a minute early so a request never starts with a token about to lapse.
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000) };
}

// ------------------------------------------------------------------ Drive API

export function driveError(status: number, json: unknown) {
  const err = (json as { error?: { message?: string; errors?: { reason?: string }[] } | string })?.error;
  const message = typeof err === "string" ? err : err?.message;
  const reason = typeof err === "object" ? err?.errors?.[0]?.reason : undefined;
  if (status === 401) return new GoogleDriveError(401, "Your Google Drive connection expired. Connect again to continue.", true);
  if (status === 403 && /not been used|disabled|accessNotConfigured/i.test(`${message} ${reason}`)) return new GoogleDriveError(503, "The Google Drive API isn't enabled for this app yet.");
  if (status === 403 && /insufficient|scope/i.test(`${message} ${reason}`)) return new GoogleDriveError(401, "Google Drive access wasn't granted. Connect again to continue.", true);
  if (status === 403 && /exportSizeLimitExceeded|too large/i.test(`${message} ${reason}`)) return new GoogleDriveError(413, "This Google document is too large for Google to export (10 MB limit).");
  if (status === 403 && /rate|quota/i.test(`${message} ${reason}`)) return new GoogleDriveError(429, "Google Drive is busy right now. Wait a moment and try again.");
  if (status === 404) return new GoogleDriveError(404, "That file isn't available — pick it again in Google Drive.");
  if (status === 429) return new GoogleDriveError(429, "Google Drive is busy right now. Wait a moment and try again.");
  return new GoogleDriveError(status >= 500 ? 502 : status, message ? `Google Drive: ${message}` : `Google Drive request failed (${status})`);
}

/** Drive file ids are URL-safe tokens; anything else is refused before it reaches a URL. */
export const isDriveId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{10,200}$/.test(id);

export function fileMetaUrl(id: string) {
  if (!isDriveId(id)) throw new GoogleDriveError(400, "Invalid Google Drive file id");
  const u = new URL(`${DRIVE_API}/files/${encodeURIComponent(id)}`);
  u.searchParams.set("fields", "id,name,mimeType,size,trashed,capabilities/canDownload");
  u.searchParams.set("supportsAllDrives", "true");
  return u.toString();
}

export function fileDownloadUrl(id: string) {
  if (!isDriveId(id)) throw new GoogleDriveError(400, "Invalid Google Drive file id");
  const u = new URL(`${DRIVE_API}/files/${encodeURIComponent(id)}`);
  u.searchParams.set("alt", "media");
  u.searchParams.set("supportsAllDrives", "true");
  return u.toString();
}

export function fileExportUrl(id: string, mimeType: string) {
  if (!isDriveId(id)) throw new GoogleDriveError(400, "Invalid Google Drive file id");
  const u = new URL(`${DRIVE_API}/files/${encodeURIComponent(id)}/export`);
  u.searchParams.set("mimeType", mimeType);
  return u.toString();
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Google-native types we can export, and to what. Others (Forms, Sites, Maps, shortcuts, folders) can't be imported. */
export const EXPORT_MAP: Record<string, { mimeType: string; ext: string }> = {
  "application/vnd.google-apps.document": { mimeType: DOCX, ext: "docx" },
  "application/vnd.google-apps.spreadsheet": { mimeType: XLSX, ext: "xlsx" },
  "application/vnd.google-apps.presentation": { mimeType: PPTX, ext: "pptx" },
  "application/vnd.google-apps.drawing": { mimeType: "application/pdf", ext: "pdf" },
};

export const isGoogleNative = (mimeType: string) => mimeType.startsWith("application/vnd.google-apps.");

/** Export target for a Google-native file, or null when it's a regular file (download as is) / not exportable. */
export function exportTarget(mimeType: string) {
  return EXPORT_MAP[mimeType] ?? null;
}

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac",
  pdf: "application/pdf",
  doc: "application/msword", docx: DOCX, xls: "application/vnd.ms-excel", xlsx: XLSX, ppt: "application/vnd.ms-powerpoint", pptx: PPTX,
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  txt: "text/plain", csv: "text/csv", md: "text/markdown", markdown: "text/markdown", json: "application/json", rtf: "application/rtf",
  zip: "application/zip", epub: "application/epub+zip",
};

const ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "text/x-markdown": "text/markdown",
  "text/comma-separated-values": "text/csv",
  "application/csv": "text/csv",
  "text/rtf": "application/rtf",
  "audio/x-wav": "audio/wav",
  "audio/mp3": "audio/mpeg",
  "application/x-zip": "application/zip",
};

/** Normalises a Drive mime type; falls back to the file extension when Drive says "octet-stream". */
export function normalizeMime(mimeType: string | null | undefined, name: string | null | undefined) {
  const base = (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  const aliased = ALIASES[base] ?? base;
  if (aliased && aliased !== "application/octet-stream" && aliased !== "binary/octet-stream") return aliased;
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name ?? "")?.[1]?.toLowerCase();
  return (ext && BY_EXT[ext]) || aliased || "application/octet-stream";
}

/** Name for the stored copy: exported documents get the export extension (Budget → Budget.xlsx). */
export function importedName(name: string | null | undefined, ext?: string) {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f/\\]+/g, " ").trim().slice(0, 240) || "Untitled";
  if (!ext) return clean;
  return clean.toLowerCase().endsWith(`.${ext}`) ? clean : `${clean}.${ext}`;
}

export type DriveFileMeta = { id: string; name: string; mimeType: string; size: number | null; trashed: boolean; canDownload: boolean };

export function parseFileMeta(json: unknown): DriveFileMeta {
  const j = (json ?? {}) as { id?: unknown; name?: unknown; mimeType?: unknown; size?: unknown; trashed?: unknown; capabilities?: { canDownload?: unknown } };
  if (typeof j.id !== "string" || !j.id) throw new GoogleDriveError(502, "Google Drive returned an unexpected file");
  const size = typeof j.size === "string" || typeof j.size === "number" ? Number(j.size) : NaN;
  return {
    id: j.id,
    name: typeof j.name === "string" ? j.name : "Untitled",
    mimeType: typeof j.mimeType === "string" ? j.mimeType : "application/octet-stream",
    size: Number.isFinite(size) && size >= 0 ? size : null,
    trashed: j.trashed === true,
    canDownload: j.capabilities?.canDownload !== false,
  };
}

async function readJson(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function getFileMeta(token: string, id: string, f: Fetch = fetch) {
  const res = await f(fileMetaUrl(id), { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) throw driveError(res.status, json);
  return parseFileMeta(json);
}

/** Which ids still need importing: drops invalid ids, repeats within the pick, ids already imported and ids to skip. */
export function partitionDriveIds(ids: string[], existingSourceIds: Iterable<string>, skipIds: Iterable<string> = []) {
  const known = new Set(existingSourceIds);
  const skip = new Set(skipIds);
  const seen = new Set<string>();
  const unique: string[] = [];
  const existing: string[] = [];
  const fresh: string[] = [];
  for (const id of ids) {
    if (!isDriveId(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (known.has(id)) existing.push(id);
    else if (!skip.has(id)) fresh.push(id);
  }
  return { unique, existing, fresh };
}

export type DownloadPlan = { url: string; mimeType: string; name: string; maxBytes: number };

/**
 * Decides how to fetch a picked file: Google-native docs are exported, regular files downloaded.
 * `maxBytesFor(mime)` returns the allowed size for a stored mime type (null = not supported).
 */
export function planDownload(meta: DriveFileMeta, maxBytesFor: (mimeType: string) => number | null): DownloadPlan {
  if (meta.trashed) throw new GoogleDriveError(410, `${meta.name} is in your Google Drive trash`);
  if (isGoogleNative(meta.mimeType)) {
    const target = exportTarget(meta.mimeType);
    if (!target) throw new GoogleDriveError(415, `${meta.name} is a Google file type that can't be imported`);
    const max = maxBytesFor(target.mimeType);
    if (max === null) throw new GoogleDriveError(415, `${meta.name} can't be imported`);
    return { url: fileExportUrl(meta.id, target.mimeType), mimeType: target.mimeType, name: importedName(meta.name, target.ext), maxBytes: Math.min(max, EXPORT_LIMIT_BYTES) };
  }
  if (!meta.canDownload) throw new GoogleDriveError(403, `The owner of ${meta.name} doesn't allow downloading it`);
  const mimeType = normalizeMime(meta.mimeType, meta.name);
  const max = maxBytesFor(mimeType);
  if (max === null) throw new GoogleDriveError(415, `${meta.name}: that file type isn't supported`);
  if (meta.size !== null && meta.size > max) throw new GoogleDriveError(413, `${meta.name} is larger than ${Math.round(max / 1024 / 1024)} MB`);
  if (meta.size === 0) throw new GoogleDriveError(400, `${meta.name} is empty`);
  return { url: fileDownloadUrl(meta.id), mimeType, name: importedName(meta.name), maxBytes: max };
}

/** Downloads (or exports) a file's bytes with the bearer token, refusing anything over the limit. */
export async function downloadPlanned(token: string, plan: DownloadPlan, f: Fetch = fetch) {
  const res = await f(plan.url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "follow" });
  if (!res.ok) throw driveError(res.status, await readJson(res));
  const tooBig = () => new GoogleDriveError(413, `${plan.name} is larger than ${Math.round(plan.maxBytes / 1024 / 1024)} MB`);
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > plan.maxBytes) throw tooBig();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new GoogleDriveError(502, `${plan.name} downloaded empty`);
  if (bytes.length > plan.maxBytes) throw tooBig();
  return bytes;
}
