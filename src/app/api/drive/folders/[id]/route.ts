import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, notFound, query, route } from "@/lib/api";
import { FOLDER_COLORS, cleanName, folderPath } from "@/lib/drive";
import { allFolders, assertFolder, checkFolderMove, purgeFolders, restoreFolder, serializeFolder, trashFolders } from "../../_lib";

const COLORS = FOLDER_COLORS.map((c) => c.value) as [string, ...string[]];

const patchSchema = z.object({
  name: z.string().max(400).optional(),
  parentId: z.string().max(40).nullable().optional(),
  color: z.enum(COLORS).nullable().optional(),
  deletedAt: z.null().optional(),
});

/** One folder with its breadcrumb path (root → folder). */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const folders = await allFolders(user.id);
  const folder = folders.find((f) => f.id === params.id);
  if (!folder) throw notFound("Folder");
  return { folder: serializeFolder(folder), path: folderPath(folders, folder.id).map(serializeFolder) };
});

/** Rename, recolour, move (`parentId`, null = root) or restore (`deletedAt: null`). */
export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  let folder = await db.driveFolder.findFirst({ where: { id: params.id, userId: user.id } });
  if (!folder) throw notFound("Folder");
  if (input.deletedAt === null && folder.deletedAt) folder = await restoreFolder(user.id, folder.id);
  else if (folder.deletedAt && (input.name !== undefined || input.parentId !== undefined || input.color !== undefined)) {
    throw new ApiError(409, "Restore the folder from the trash before changing it");
  }

  const data: { name?: string; parentId?: string | null; color?: string | null } = {};
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) throw new ApiError(400, "Give the folder a name");
    data.name = name;
  }
  if (input.color !== undefined) data.color = input.color;
  if (input.parentId !== undefined && input.parentId !== folder.parentId) {
    const target = input.parentId || null;
    await assertFolder(user.id, target);
    checkFolderMove(await allFolders(user.id), folder.id, target);
    data.parentId = target;
  }
  if (Object.keys(data).length) folder = await db.driveFolder.update({ where: { id: folder.id }, data });
  return { folder: serializeFolder(folder) };
});

/** Soft delete with everything inside; `?permanent=1` deletes it all for good (stored files too). */
export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const folder = await db.driveFolder.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!folder) throw notFound("Folder");
  if (query(req).get("permanent") === "1") return { ok: true, ...(await purgeFolders(user.id, [folder.id])) };
  await trashFolders(user.id, [folder.id]);
  return { ok: true };
});
