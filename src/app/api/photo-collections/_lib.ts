import "server-only";
import type { MediaFile, PhotoCollection } from "@prisma/client";
import { serializeMedia } from "@/lib/media";

export function serializeCollection(c: PhotoCollection & { _count?: { photos: number }; photos?: { media: MediaFile }[] }) {
  const cover = c.photos?.[0]?.media;
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    count: c._count?.photos ?? 0,
    cover: cover ? serializeMedia(cover) : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const collectionInclude = {
  _count: { select: { photos: { where: { deletedAt: null } } } },
  photos: { where: { deletedAt: null, media: { status: "ready", kind: "image" } }, include: { media: true }, orderBy: [{ takenOn: "desc" as const }, { createdAt: "desc" as const }], take: 1 },
};

