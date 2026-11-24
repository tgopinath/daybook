"use client";
import { api, HttpError } from "./client";

/** What the media API returns for a file (see src/lib/media.ts → serializeMedia). */
export type Media = {
  id: string;
  kind: "image" | "video" | "audio" | "document";
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  originalName: string | null;
  source: string;
  takenAt: string | null;
  status: string;
  createdAt: string;
  url: string; // authenticated; use directly in <img src> / <video src>
};

const MAX_EDGE = 2560;

/** Downscales large photos to at most 2560px (JPEG/WebP) so uploads are fast; other files pass through. */
async function prepareImage(file: File): Promise<{ blob: Blob; width?: number; height?: number }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { blob: file };
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    if (scale === 1 && file.size < 4 * 1024 * 1024) {
      bitmap.close();
      return { blob: file, width, height };
    }
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.88));
    return blob && blob.size < file.size ? { blob, width: w, height: h } : { blob: file, width, height };
  } catch {
    return { blob: file };
  }
}

function put(url: string, blob: Blob, headers: Record<string, string>, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new HttpError(xhr.status, "Upload failed. Please try again.")));
    xhr.onerror = () => reject(new HttpError(0, "Upload failed. Check your connection and try again."));
    xhr.send(blob);
  });
}

/**
 * Uploads one file and returns the ready Media row.
 * Flow: POST /api/media → PUT bytes (straight to storage when available) → POST /api/media/:id/complete.
 */
export async function uploadFile(file: File, opts: { onProgress?: (p: number) => void; takenAt?: Date } = {}): Promise<Media> {
  const { blob, width, height } = await prepareImage(file);
  const mimeType = blob.type || file.type || "application/octet-stream";
  const takenAt = opts.takenAt ?? (file.lastModified ? new Date(file.lastModified) : undefined);
  const start = await api.post<{ media: Media; upload: { url: string; headers: Record<string, string> } }>("/api/media", {
    fileName: file.name,
    mimeType,
    size: blob.size,
    width,
    height,
    takenAt: takenAt?.toISOString(),
  });
  await put(start.upload.url, blob, start.upload.headers, opts.onProgress);
  const done = await api.post<{ media: Media }>(`/api/media/${start.media.id}/complete`);
  return done.media;
}

export const ACCEPT = {
  images: "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif",
  imagesAndVideos: "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm",
  audio: "audio/*",
  documents: "application/pdf,image/jpeg,image/png,image/webp",
};
