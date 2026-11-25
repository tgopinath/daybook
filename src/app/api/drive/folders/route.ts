import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, query, route } from "@/lib/api";
import { FOLDER_COLORS, MAX_FOLDER_DEPTH, cleanName, folderPath } from "@/lib/drive";
import { allFolders, assertFolder, serializeFolder } from "../_lib";

const COLORS = FOLDER_COLORS.map((c) => c.value) as [string, ...string[]];

const createSchema = z.object({
  name: z.string().max(400),
  parentId: z.string().max(40).nullable().optional(),
  color: z.enum(COLORS).nullable().optional(),
});

/**
 * Folders for the tree. Default: live folders. `?scope=trash`: trashed folders whose parent isn't
 * trashed too (the top of each trashed subtree). `?scope=archived`: [] (folders can't be archived).
 */
export const GET = route(async ({ req, user }) => {
  const scope = query(req).get("scope");
  if (scope === "archived") return { items: [] };
  const folders = await allFolders(user.id);
  if (scope === "trash") {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const top = folders.filter((f) => f.deletedAt && !(f.parentId && byId.get(f.parentId)?.deletedAt));
    top.sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime());
    return { items: top.map(serializeFolder) };
  }
  return { items: folders.filter((f) => !f.deletedAt).map(serializeFolder) };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  const name = cleanName(input.name);
  if (!name) throw new ApiError(400, "Give the folder a name");
  const parentId = input.parentId || null;
  await assertFolder(user.id, parentId);
  if (parentId) {
    const folders = await allFolders(user.id);
    if (folderPath(folders, parentId).length >= MAX_FOLDER_DEPTH) throw new ApiError(400, `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
  }
  const count = await db.driveFolder.count({ where: { userId: user.id } });
  if (count >= 5000) throw new ApiError(400, "You've reached the folder limit (5,000)");
  const folder = await db.driveFolder.create({ data: { userId: user.id, name, parentId, color: input.color ?? null } });
  return { folder: serializeFolder(folder) };
});
