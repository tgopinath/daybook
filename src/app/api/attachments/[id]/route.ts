import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { db } from "@/lib/db";
import { ApiError, notFound, route } from "@/lib/api";
import { removeFiles, storagePath } from "@/lib/tasks";

export const runtime = "nodejs";

/** Authenticated download, always as an attachment (never rendered inline). */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const a = await db.attachment.findFirst({ where: { id: params.id, userId: user.id } });
  if (!a) throw notFound("Attachment");
  const file = storagePath(a.storageKey);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) throw new ApiError(410, "File is missing from storage");
  const ascii = a.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": a.mimeType || "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const a = await db.attachment.findFirst({ where: { id: params.id, userId: user.id } });
  if (!a) throw notFound("Attachment");
  await db.attachment.delete({ where: { id: a.id } });
  await removeFiles([a.storageKey]);
  return { ok: true };
});
