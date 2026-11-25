import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, query, route } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { deleteObjects, presignDownload, readLocalObject } from "@/lib/storage";

/**
 * Serves a file to its owner only: redirects to a short-lived presigned URL (bucket)
 * or streams it (local). ?download=1 saves it with its original name; ?meta=1 returns JSON.
 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const media = await db.mediaFile.findFirst({ where: { id: params.id, userId: user.id, status: "ready" } });
  if (!media) throw notFound("File");
  const q = query(req);
  if (q.has("meta")) return { media: serializeMedia(media) };
  // Everyday files (Office docs, text, ZIP…) are only ever downloaded, never rendered in the browser.
  const forceDownload = q.has("download") || media.kind === "file";
  const downloadName = forceDownload ? media.originalName || `mydiary-${media.id}` : undefined;
  const url = await presignDownload(media.storageKey, { downloadName, contentType: media.mimeType });
  if (url) return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=600" } });
  return new Response(readLocalObject(media.storageKey), {
    headers: {
      "content-type": media.mimeType,
      "content-length": String(media.size),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      ...(downloadName ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` } : {}),
    },
  });
});

/** Deletes the file everywhere it's used (journal, memories, photos…) and from storage. */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const media = await db.mediaFile.findFirst({ where: { id: params.id, userId: user.id } });
  if (!media) throw notFound("File");
  await db.mediaFile.delete({ where: { id: media.id } });
  await deleteObjects([media.storageKey]).catch((err) => console.error("[media] delete failed", err));
  return { ok: true };
});
