import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { assertMediaOwned, serializeAlbum } from "@/lib/memories";
import { albumCovers } from "./_lib";

/** Albums with memory counts and a cover (chosen cover, else the newest memory's first photo). */
export const GET = route(async ({ user }) => {
  const rows = await db.album.findMany({
    where: { userId: user.id },
    include: { cover: true, _count: { select: { memories: { where: { deletedAt: null, archivedAt: null } } } } },
    orderBy: [{ updatedAt: "desc" }],
  });
  const fallback = await albumCovers(user.id, rows.filter((a) => !a.cover).map((a) => a.id));
  return { items: rows.map((a) => serializeAlbum(a, fallback.get(a.id))) };
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Name the album").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  coverMediaId: z.string().max(40).nullable().optional(),
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  if (input.coverMediaId) await assertMediaOwned(user.id, [input.coverMediaId]);
  const album = await db.album.create({
    data: { userId: user.id, title: input.title, description: input.description || null, coverMediaId: input.coverMediaId || null },
    include: { cover: true, _count: { select: { memories: true } } },
  });
  return { item: serializeAlbum(album) };
});
