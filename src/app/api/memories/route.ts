import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { memoryFields } from "./_schema";
import { appendMemoryMedia, assertAlbum, assertMediaOwned, memoryDate, memoryInclude, serializeMemory } from "@/lib/memories";

/**
 * Lists memories, newest first, with cursor pagination.
 * Filters: scope=archived|trash, albumId, favorite=1, video=1, q (title/caption/location).
 * The first page also returns `months` ([{ key: "yyyy-MM", count }]) for the jump bar and `total`.
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const tz = tzOf(req);
  const scope = sp.get("scope");
  const where: Prisma.MemoryWhereInput = { userId: user.id };
  if (scope === "trash") where.deletedAt = { not: null };
  else if (scope === "archived") Object.assign(where, { deletedAt: null, archivedAt: { not: null } });
  else Object.assign(where, { deletedAt: null, archivedAt: null });
  const albumId = sp.get("albumId");
  if (albumId) where.albumId = albumId === "none" ? null : albumId;
  if (sp.get("favorite") === "1") where.favorite = true;
  if (sp.get("video") === "1") where.media = { some: { media: { kind: "video" } } };
  const q = sp.get("q")?.trim();
  if (q)
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { caption: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
    ];

  const take = Math.min(Math.max(Number(sp.get("limit")) || 48, 1), 200);
  const cursor = sp.get("cursor");
  const rows = await db.memory.findMany({
    where,
    include: memoryInclude,
    orderBy: scope === "trash" ? [{ deletedAt: "desc" }, { id: "desc" }] : [{ date: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  const out: Record<string, unknown> = {
    items: page.map((m) => serializeMemory(m, tz)),
    nextCursor: rows.length > take ? page[page.length - 1]!.id : null,
  };
  if (!cursor) {
    const dates = await db.memory.findMany({ where, select: { date: true } });
    const counts = new Map<string, number>();
    for (const d of dates) {
      const key = dayKey(d.date, tz).slice(0, 7);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    out.months = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, count]) => ({ key, count }));
    out.total = dates.length;
  }
  return out;
});

const createSchema = z.object(memoryFields);

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  const tz = tzOf(req);
  await assertAlbum(user.id, input.albumId);
  const mediaIds = [...new Set(input.mediaIds ?? [])];
  await assertMediaOwned(user.id, mediaIds);
  const memory = await db.memory.create({
    data: {
      userId: user.id,
      title: input.title,
      caption: input.caption || null,
      date: memoryDate(input.date, tz),
      location: input.location || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      albumId: input.albumId || null,
      favorite: input.favorite ?? false,
    },
  });
  await appendMemoryMedia(memory.id, mediaIds);
  const full = await db.memory.findFirstOrThrow({ where: { id: memory.id, userId: user.id }, include: memoryInclude });
  return { item: serializeMemory(full, tz) };
});
