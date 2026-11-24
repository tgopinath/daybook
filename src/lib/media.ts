import "server-only";
import { randomBytes } from "crypto";
import type { MediaFile } from "@prisma/client";
import { ApiError } from "./api";
import { isDemoEmail } from "./demo-mode";
import { storageAvailable } from "./storage";

/** Allowed types and size limits per kind. */
export const MEDIA_RULES = {
  image: { types: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"], maxBytes: 25 * 1024 * 1024 },
  video: { types: ["video/mp4", "video/quicktime", "video/webm"], maxBytes: 250 * 1024 * 1024 },
  audio: { types: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/aac"], maxBytes: 50 * 1024 * 1024 },
  document: { types: ["application/pdf"], maxBytes: 25 * 1024 * 1024 },
} as const;
export type MediaKind = keyof typeof MEDIA_RULES;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/webm": "weba", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/aac": "aac",
  "application/pdf": "pdf",
};

export function kindOf(mimeType: string): MediaKind | null {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  for (const [kind, rule] of Object.entries(MEDIA_RULES)) if ((rule.types as readonly string[]).includes(base)) return kind as MediaKind;
  return null;
}

/** Validates an upload request; throws a clear ApiError otherwise. */
export function checkUpload(user: { email: string }, mimeType: string, size: number): MediaKind {
  if (isDemoEmail(user.email)) throw new ApiError(403, "Uploading files isn't available in the demo");
  if (!storageAvailable()) throw new ApiError(503, "Photo and file storage isn't set up on this server yet");
  const kind = kindOf(mimeType);
  if (!kind) throw new ApiError(415, "That file type isn't supported. Use photos (JPG, PNG, WebP, HEIC), videos (MP4, MOV), audio or PDF.");
  const max = MEDIA_RULES[kind].maxBytes;
  if (size <= 0) throw new ApiError(400, "The file is empty");
  if (size > max) throw new ApiError(413, `That ${kind} is larger than ${Math.round(max / 1024 / 1024)} MB`);
  return kind;
}

/** Object key: per-user prefix, random name; never derived from the original file name. */
export function newStorageKey(userId: string, mimeType: string) {
  const ext = EXT[mimeType.split(";")[0]!.trim().toLowerCase()] ?? "bin";
  const month = new Date().toISOString().slice(0, 7);
  return `u/${userId}/${month}/${randomBytes(16).toString("hex")}.${ext}`;
}

/** What the client gets: metadata plus the authenticated URL that serves the file. */
export function serializeMedia(m: MediaFile) {
  return {
    id: m.id,
    kind: m.kind,
    mimeType: m.mimeType,
    size: m.size,
    width: m.width,
    height: m.height,
    durationSec: m.durationSec,
    originalName: m.originalName,
    source: m.source,
    takenAt: m.takenAt,
    status: m.status,
    createdAt: m.createdAt,
    url: `/api/media/${m.id}`,
  };
}
export type MediaDTO = ReturnType<typeof serializeMedia>;
