import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { allFolders, assertFolder, checkFolderMove, purgeFiles, purgeFolders, restoreFiles, restoreFolder, trashFolders } from "../_lib";

const ids = z.array(z.string().min(1).max(40)).max(500).default([]);
const schema = z.object({
  action: z.enum(["move", "star", "unstar", "trash", "restore", "delete"]),
  fileIds: ids,
  folderIds: ids,
  /** Target for "move" (null = root). */
  folderId: z.string().max(40).nullable().optional(),
});

/** Bulk actions for a multi-selection of files and folders. Every id is checked against the user. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, schema);
  const fileIds = [...new Set(input.fileIds)];
  const folderIds = [...new Set(input.folderIds)];
  if (!fileIds.length && !folderIds.length) throw new ApiError(400, "Nothing selected");
  const userId = user.id;

  switch (input.action) {
    case "move": {
      const target = input.folderId || null;
      await assertFolder(userId, target);
      const folders = await allFolders(userId);
      const movable = folderIds.filter((id) => folders.some((f) => f.id === id && !f.deletedAt));
      // Simulate the moves one by one so two selected folders can't end up inside each other.
      const sim = folders.map((f) => ({ ...f }));
      for (const id of movable) {
        checkFolderMove(sim, id, target);
        sim.find((f) => f.id === id)!.parentId = target;
      }
      await db.$transaction([
        db.driveFile.updateMany({ where: { userId, id: { in: fileIds }, deletedAt: null }, data: { folderId: target } }),
        db.driveFolder.updateMany({ where: { userId, id: { in: movable } }, data: { parentId: target } }),
      ]);
      return { ok: true, moved: fileIds.length + movable.length };
    }
    case "star":
    case "unstar": {
      const r = await db.driveFile.updateMany({ where: { userId, id: { in: fileIds } }, data: { starred: input.action === "star" } });
      return { ok: true, updated: r.count };
    }
    case "trash": {
      const r = await db.driveFile.updateMany({ where: { userId, id: { in: fileIds }, deletedAt: null }, data: { deletedAt: new Date() } });
      const f = await trashFolders(userId, folderIds);
      return { ok: true, trashed: r.count + f };
    }
    case "restore": {
      const n = await restoreFiles(userId, fileIds);
      const owned = await db.driveFolder.findMany({ where: { userId, id: { in: folderIds } }, select: { id: true } });
      for (const f of owned) await restoreFolder(userId, f.id);
      return { ok: true, restored: n + owned.length };
    }
    case "delete": {
      const a = await purgeFiles(userId, fileIds);
      const b = await purgeFolders(userId, folderIds);
      return { ok: true, files: a.files + b.files, folders: b.folders, objects: a.objects + b.objects };
    }
  }
});
