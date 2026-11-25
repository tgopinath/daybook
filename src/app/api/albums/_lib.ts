import "server-only";
import type { MediaFile } from "@prisma/client";
import { db } from "@/lib/db";

/** Fallback covers: the first image of the newest memory in each album. */
export async function albumCovers(userId: string, albumIds: string[]) {
  const out = new Map<string, MediaFile>();
  if (!albumIds.length) return out;
  const memories = await db.memory.findMany({
    where: { userId, albumId: { in: albumIds }, deletedAt: null, archivedAt: null, media: { some: { media: { kind: "image", status: "ready" } } } },
    select: { albumId: true, media: { where: { media: { kind: "image", status: "ready" } }, include: { media: true }, orderBy: { sortOrder: "asc" }, take: 1 } },
    orderBy: { date: "desc" },
  });
  for (const m of memories) if (m.albumId && !out.has(m.albumId) && m.media[0]) out.set(m.albumId, m.media[0].media);
  return out;
}
