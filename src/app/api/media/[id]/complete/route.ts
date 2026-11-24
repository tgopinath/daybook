import { db } from "@/lib/db";
import { ApiError, notFound, route } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { deleteObjects, objectSize } from "@/lib/storage";

/** Confirms the bytes arrived with the declared size, then marks the file ready. */
export const POST = route<{ id: string }>(async ({ user, params }) => {
  const media = await db.mediaFile.findFirst({ where: { id: params.id, userId: user.id } });
  if (!media) throw notFound("File");
  if (media.status === "ready") return { media: serializeMedia(media) };
  const size = await objectSize(media.storageKey);
  if (size === null) throw new ApiError(400, "The file hasn't finished uploading");
  if (size !== media.size) {
    await deleteObjects([media.storageKey]);
    await db.mediaFile.delete({ where: { id: media.id } });
    throw new ApiError(400, "The uploaded file doesn't match what was expected. Try again.");
  }
  const ready = await db.mediaFile.update({ where: { id: media.id }, data: { status: "ready" } });
  return { media: serializeMedia(ready) };
});
