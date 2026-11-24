import "server-only";
import type { BucketItem, MediaFile } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { BUCKET_CATEGORIES } from "@/components/bucket-list/meta";
import { ApiError, notFound } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { deleteObjects } from "@/lib/storage";

/** yyyy-MM-dd → noon UTC of that day (stable across timezones); null clears. */
export function dayToDate(day: string | null | undefined): Date | null | undefined {
  if (day === undefined) return undefined;
  if (day === null || day === "") return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12));
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const bucketFields = {
  title: z.string().trim().min(1, "Give it a title").max(200),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(BUCKET_CATEGORIES).optional(),
  targetDate: z.string().regex(DAY_RE).nullable().optional(),
  imageMediaId: z.string().min(1).max(64).nullable().optional(),
};


type Row = BucketItem & { image: MediaFile | null };

export function serializeBucket(b: Row) {
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    category: b.category,
    targetDate: b.targetDate,
    completedAt: b.completedAt,
    imageMediaId: b.imageMediaId,
    image: b.image && b.image.status === "ready" ? serializeMedia(b.image) : null,
    sortOrder: b.sortOrder,
    archivedAt: b.archivedAt,
    deletedAt: b.deletedAt,
    isDemo: b.isDemo,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export async function findBucket(userId: string, id: string) {
  const item = await db.bucketItem.findFirst({ where: { id, userId } });
  if (!item) throw notFound("Bucket list item");
  return item;
}

/** Throws unless every id is a ready media file owned by the user. */
export async function assertOwnMedia(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const n = await db.mediaFile.count({ where: { id: { in: unique }, userId, status: "ready" } });
  if (n !== unique.length) throw new ApiError(400, "One of the photos couldn't be found. Please upload it again.");
}

/**
 * Deletes media files that no record references any more (after a permanent delete).
 * Files still linked from a journal entry, memory, photo, bucket item, timeline event or album cover are kept.
 */
export async function deleteUnusedMedia(userId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  const unused = await db.mediaFile.findMany({
    where: {
      id: { in: unique },
      userId,
      journal: { none: {} },
      memories: { none: {} },
      photos: { none: {} },
      bucketItems: { none: {} },
      timeline: { none: {} },
      albumCovers: { none: {} },
    },
    select: { id: true, storageKey: true },
  });
  if (!unused.length) return;
  await db.mediaFile.deleteMany({ where: { id: { in: unused.map((m) => m.id) }, userId } });
  await deleteObjects(unused.map((m) => m.storageKey)).catch((err) => console.error("[media] delete failed", err));
}
