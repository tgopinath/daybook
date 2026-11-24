import { z } from "zod";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";
import { checkUpload, newStorageKey, serializeMedia } from "@/lib/media";
import { presignUpload } from "@/lib/storage";

const startSchema = z.object({
  fileName: z.string().max(255).optional(),
  mimeType: z.string().min(3).max(100),
  size: z.number().int().positive(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  durationSec: z.number().positive().max(24 * 3600).optional(),
  takenAt: z.string().datetime().optional(),
});

/**
 * Starts an upload: creates a pending MediaFile and returns where to PUT the bytes
 * (a presigned bucket URL, or this API's /content route in local mode).
 * Then call POST /api/media/:id/complete.
 */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, startSchema);
  const kind = checkUpload(user, input.mimeType, input.size);
  const mimeType = input.mimeType.split(";")[0]!.trim().toLowerCase();
  const storageKey = newStorageKey(user.id, mimeType);
  const media = await db.mediaFile.create({
    data: {
      userId: user.id,
      kind,
      mimeType,
      size: input.size,
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
      originalName: input.fileName?.slice(0, 255),
      takenAt: input.takenAt ? new Date(input.takenAt) : null,
      storageKey,
    },
  });
  const direct = await presignUpload(storageKey, mimeType);
  return {
    media: serializeMedia(media),
    upload: { method: "PUT", url: direct ?? `/api/media/${media.id}/content`, headers: { "content-type": mimeType } },
  };
});

/** Lists the user's ready media (newest first), optionally by kind. */
export const GET = route(async ({ req, user }) => {
  const q = query(req);
  const kind = q.get("kind");
  const take = Math.min(Number(q.get("limit")) || 60, 200);
  const cursor = q.get("cursor");
  const items = await db.mediaFile.findMany({
    where: { userId: user.id, status: "ready", ...(kind ? { kind } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = items.slice(0, take);
  return { items: page.map(serializeMedia), nextCursor: items.length > take ? page[page.length - 1]!.id : null };
});
