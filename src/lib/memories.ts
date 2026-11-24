import "server-only";
import type { Album, MediaFile, Memory, MemoryMedia, PhotoCollection, PhotoEntry, Prisma } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "./api";
import { serializeMedia } from "./media";
import { deleteObjects } from "./storage";
import { dayKey, zonedToUtc } from "./time";

// Shared server helpers for Memories, Albums and the Photo Diary.

export const memoryInclude = {
  album: { select: { id: true, title: true } },
  media: { include: { media: true }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.MemoryInclude;

type MemoryRow = Memory & { album: Pick<Album, "id" | "title"> | null; media: (MemoryMedia & { media: MediaFile })[] };

export function serializeMemory(m: MemoryRow, tz: string) {
  const media = m.media.filter((x) => x.media.status === "ready").map((x) => serializeMedia(x.media));
  return {
    id: m.id,
    title: m.title,
    caption: m.caption,
    date: m.date,
    day: dayKey(m.date, tz),
    location: m.location,
    latitude: m.latitude,
    longitude: m.longitude,
    albumId: m.albumId,
    album: m.album,
    favorite: m.favorite,
    archivedAt: m.archivedAt,
    deletedAt: m.deletedAt,
    isDemo: m.isDemo,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    media,
    cover: media.find((x) => x.kind === "image") ?? media[0] ?? null,
    hasVideo: media.some((x) => x.kind === "video"),
  };
}
export type MemoryDTO = ReturnType<typeof serializeMemory>;

export function serializeAlbum(a: Album & { cover: MediaFile | null; _count?: { memories: number } }, fallbackCover?: MediaFile | null) {
  const cover = a.cover?.status === "ready" ? a.cover : (fallbackCover ?? null);
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    coverMediaId: a.coverMediaId,
    cover: cover ? serializeMedia(cover) : null,
    count: a._count?.memories ?? 0,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export function serializePhoto(p: PhotoEntry & { media: MediaFile; collection?: Pick<PhotoCollection, "id" | "title"> | null }) {
  return {
    id: p.id,
    mediaId: p.mediaId,
    media: serializeMedia(p.media),
    caption: p.caption,
    tags: p.tags,
    takenOn: p.takenOn,
    collectionId: p.collectionId,
    collection: p.collection ?? null,
    favorite: p.favorite,
    deletedAt: p.deletedAt,
    // Photo entries have no archive state; kept for the shared list contract.
    archivedAt: null,
    title: p.caption || p.media.originalName || "Photo",
    isDemo: false,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
export type PhotoDTO = ReturnType<typeof serializePhoto>;

/** Memory dates are calendar days: stored at local noon so they never drift across midnight. */
export function memoryDate(input: string, tz: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return zonedToUtc(input, "12:00", tz);
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "date: invalid date");
  return d;
}

/** Throws unless every id is a ready file owned by the user. */
export async function assertMediaOwned(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const n = await db.mediaFile.count({ where: { id: { in: unique }, userId, status: "ready" } });
  if (n !== unique.length) throw new ApiError(400, "Some photos or videos weren't found or haven't finished uploading");
}

export async function assertAlbum(userId: string, albumId: string | null | undefined) {
  if (!albumId) return;
  const ok = await db.album.count({ where: { id: albumId, userId } });
  if (!ok) throw new ApiError(400, "Album not found");
}

export async function assertCollection(userId: string, collectionId: string | null | undefined) {
  if (!collectionId) return;
  const ok = await db.photoCollection.count({ where: { id: collectionId, userId } });
  if (!ok) throw new ApiError(400, "Collection not found");
}

/** Replaces a memory's media with `ids` in that order (first = cover). */
export async function setMemoryMedia(memoryId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  await db.$transaction([
    db.memoryMedia.deleteMany({ where: { memoryId, mediaId: { notIn: unique } } }),
    ...unique.map((mediaId, sortOrder) =>
      db.memoryMedia.upsert({ where: { memoryId_mediaId: { memoryId, mediaId } }, update: { sortOrder }, create: { memoryId, mediaId, sortOrder } }),
    ),
  ]);
}

/** Appends media to a memory (skipping ones already linked). */
export async function appendMemoryMedia(memoryId: string, ids: string[]) {
  if (!ids.length) return;
  const agg = await db.memoryMedia.aggregate({ where: { memoryId }, _max: { sortOrder: true } });
  const start = (agg._max.sortOrder ?? -1) + 1;
  await db.memoryMedia.createMany({ data: ids.map((mediaId, i) => ({ memoryId, mediaId, sortOrder: start + i })), skipDuplicates: true });
}

/**
 * Deletes files (storage + MediaFile row) that nothing references any more.
 * Call after permanently deleting the records that used them.
 */
export async function deleteOrphanMedia(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return 0;
  const files = await db.mediaFile.findMany({
    where: { id: { in: unique }, userId },
    select: { id: true, storageKey: true, _count: { select: { journal: true, memories: true, photos: true, bucketItems: true, timeline: true, albumCovers: true } } },
  });
  const orphans = files.filter((f) => Object.values(f._count).every((n) => n === 0));
  if (!orphans.length) return 0;
  await db.mediaFile.deleteMany({ where: { id: { in: orphans.map((f) => f.id) }, userId } });
  await deleteObjects(orphans.map((f) => f.storageKey)).catch((err) => console.error("[media] delete failed", err));
  return orphans.length;
}

/** Permanently deletes memories and any media only they used. */
export async function purgeMemories(userId: string, ids: string[]) {
  const links = await db.memoryMedia.findMany({ where: { memoryId: { in: ids }, memory: { userId } }, select: { mediaId: true } });
  const res = await db.memory.deleteMany({ where: { id: { in: ids }, userId } });
  await deleteOrphanMedia(userId, links.map((l) => l.mediaId));
  return res.count;
}

/** Permanently deletes photo entries and their files when nothing else uses them. */
export async function purgePhotos(userId: string, ids: string[]) {
  const rows = await db.photoEntry.findMany({ where: { id: { in: ids }, userId }, select: { mediaId: true } });
  const res = await db.photoEntry.deleteMany({ where: { id: { in: ids }, userId } });
  await deleteOrphanMedia(userId, rows.map((r) => r.mediaId));
  return res.count;
}

export function normalizeTags(tags: string[]) {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 40);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 30);
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
