import { db } from "@/lib/db";
import { ApiError, notFound, route } from "@/lib/api";
import { TEXT_PREVIEW_MAX, isTextPreviewable } from "@/lib/drive";
import { presignDownload, readLocalObject, storageMode } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Reads up to `max` bytes from a web stream. */
async function readCapped(stream: ReadableStream<Uint8Array>, max: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const room = max - total;
      if (value.length > room) {
        chunks.push(value.subarray(0, room));
        total += room;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return { bytes: out, truncated };
}

/**
 * Plain-text preview of a text/CSV/Markdown/JSON file (first 1 MB). Returned as JSON so the browser
 * shows it in a <pre> — it is never rendered as HTML.
 */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const file = await db.driveFile.findFirst({ where: { id: params.id, userId: user.id }, include: { media: true } });
  if (!file || file.media.status !== "ready") throw notFound("File");
  if (!isTextPreviewable(file.media.mimeType)) throw new ApiError(415, "This file can't be previewed as text");
  let stream: ReadableStream<Uint8Array>;
  if (storageMode() === "s3") {
    const url = await presignDownload(file.media.storageKey, { expiresIn: 120 });
    if (!url) throw new ApiError(503, "Storage isn't available");
    const res = await fetch(url, { headers: { range: `bytes=0-${TEXT_PREVIEW_MAX - 1}` }, cache: "no-store" });
    if (!res.ok || !res.body) throw new ApiError(502, "Couldn't read the file");
    stream = res.body;
  } else if (storageMode() === "local") {
    stream = readLocalObject(file.media.storageKey) as ReadableStream<Uint8Array>;
  } else {
    throw new ApiError(503, "File storage isn't set up on this server");
  }
  const { bytes, truncated } = await readCapped(stream, TEXT_PREVIEW_MAX);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return Response.json(
    { text, truncated: truncated || file.media.size > TEXT_PREVIEW_MAX, size: file.media.size },
    { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } },
  );
});
