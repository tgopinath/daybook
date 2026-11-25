import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, route } from "@/lib/api";
import { assertMediaOwned, serializeAlbum } from "@/lib/memories";
import { albumCovers } from "../_lib";

const include = { cover: true, _count: { select: { memories: { where: { deletedAt: null, archivedAt: null } } } } } satisfies Prisma.AlbumInclude;

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const album = await db.album.findFirst({ where: { id: params.id, userId: user.id }, include });
  if (!album) throw notFound("Album");
  const fallback = album.cover ? undefined : (await albumCovers(user.id, [album.id])).get(album.id);
  return { item: serializeAlbum(album, fallback) };
});

const patchSchema = z.object({
  title: z.string().trim().min(1, "Name the album").max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  coverMediaId: z.string().max(40).nullable().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const existing = await db.album.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Album");
  if (input.coverMediaId) await assertMediaOwned(user.id, [input.coverMediaId]);
  const data: Prisma.AlbumUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.coverMediaId !== undefined) data.coverMediaId = input.coverMediaId || null;
  const album = await db.album.update({ where: { id: existing.id }, data, include });
  const fallback = album.cover ? undefined : (await albumCovers(user.id, [album.id])).get(album.id);
  return { item: serializeAlbum(album, fallback) };
});

/** Deletes the album only; its memories stay (albumId becomes null). */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const existing = await db.album.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Album");
  await db.$transaction([
    db.memory.updateMany({ where: { albumId: existing.id, userId: user.id }, data: { albumId: null } }),
    db.album.delete({ where: { id: existing.id } }),
  ]);
  return { ok: true };
});
