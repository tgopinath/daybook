import { db } from "@/lib/db";
import { ApiError, notFound, route } from "@/lib/api";
import { storageMode, writeObject } from "@/lib/storage";

/** Local storage only: receives the bytes of a pending upload. */
export const PUT = route<{ id: string }>(async ({ req, user, params }) => {
  if (storageMode() !== "local") throw new ApiError(404, "Not found");
  const media = await db.mediaFile.findFirst({ where: { id: params.id, userId: user.id } });
  if (!media) throw notFound("File");
  if (media.status !== "pending") throw new ApiError(409, "This upload is already finished");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength !== media.size) throw new ApiError(400, "The uploaded size doesn't match");
  await writeObject(media.storageKey, bytes, media.mimeType);
  return { ok: true };
});
