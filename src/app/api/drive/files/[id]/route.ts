import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, notFound, query, route } from "@/lib/api";
import { cleanName, folderPathLabel } from "@/lib/drive";
import { allFolders, assertFolder, purgeFiles, restoreFiles, serializeFile } from "../../_lib";

const patchSchema = z.object({
  name: z.string().max(400).optional(),
  folderId: z.string().max(40).nullable().optional(),
  starred: z.boolean().optional(),
  deletedAt: z.null().optional(),
});

/** One file with its folder path (used by in-app links: /drive?file=<id>). */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const file = await db.driveFile.findFirst({ where: { id: params.id, userId: user.id }, include: { media: true } });
  if (!file) throw notFound("File");
  const folders = await allFolders(user.id);
  return { file: serializeFile(file, folderPathLabel(folders, file.folderId)) };
});

/** Rename, move (`folderId`, null = root), star, or restore (`deletedAt: null`). */
export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const file = await db.driveFile.findFirst({ where: { id: params.id, userId: user.id } });
  if (!file) throw notFound("File");
  if (input.deletedAt === null && file.deletedAt) await restoreFiles(user.id, [file.id]);
  const data: { name?: string; folderId?: string | null; starred?: boolean } = {};
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) throw new ApiError(400, "Give the file a name");
    data.name = name;
  }
  if (input.folderId !== undefined) {
    const target = input.folderId || null;
    await assertFolder(user.id, target);
    data.folderId = target;
  }
  if (input.starred !== undefined) data.starred = input.starred;
  if (Object.keys(data).length) await db.driveFile.update({ where: { id: file.id }, data });
  const out = await db.driveFile.findFirstOrThrow({ where: { id: file.id, userId: user.id }, include: { media: true } });
  return { file: serializeFile(out) };
});

/** Moves the file to the trash; `?permanent=1` deletes it for good (and the stored object, if nothing else uses it). */
export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const file = await db.driveFile.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true, deletedAt: true } });
  if (!file) throw notFound("File");
  if (query(req).get("permanent") === "1") return { ok: true, ...(await purgeFiles(user.id, [file.id])) };
  if (!file.deletedAt) await db.driveFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
  return { ok: true };
});
