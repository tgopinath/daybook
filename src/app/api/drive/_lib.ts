import "server-only";
import type { DriveFile, DriveFolder, MediaFile, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { deleteObjects } from "@/lib/storage";
import { MAX_FOLDER_DEPTH, descendantIds, folderPath, subtreeDepth, wouldCreateCycle } from "@/lib/drive";

export function serializeFolder(f: DriveFolder) {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    color: f.color,
    deletedAt: f.deletedAt,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    isDemo: false,
  };
}

export function serializeFile(f: DriveFile & { media: MediaFile }, path?: string) {
  return {
    id: f.id,
    name: f.name,
    folderId: f.folderId,
    starred: f.starred,
    source: f.source,
    deletedAt: f.deletedAt,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    isDemo: false,
    ...(path !== undefined ? { path } : {}),
    media: serializeMedia(f.media),
  };
}

/** Every folder of the user (incl. trashed) — small enough to load whole for tree math. */
export const allFolders = (userId: string) => db.driveFolder.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] });

/** A live (not trashed) folder owned by the user, or 404. `null` means the root. */
export async function assertFolder(userId: string, folderId: string | null | undefined) {
  if (!folderId) return null;
  const f = await db.driveFolder.findFirst({ where: { id: folderId, userId, deletedAt: null } });
  if (!f) throw notFound("Folder");
  return f;
}

/** Validates moving `folderId` under `targetId` (ownership, not into itself / a descendant, depth). */
export function checkFolderMove(folders: DriveFolder[], folderId: string, targetId: string | null) {
  if (wouldCreateCycle(folders, folderId, targetId)) throw new ApiError(400, "A folder can't be moved into itself or one of its subfolders");
  const depth = folderPath(folders, targetId).length + subtreeDepth(folders, folderId);
  if (depth > MAX_FOLDER_DEPTH) throw new ApiError(400, `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
}

/** Soft-deletes folders with everything inside (folders + files not already trashed), sharing one timestamp. */
export async function trashFolders(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const folders = await allFolders(userId);
  const own = ids.filter((id) => folders.some((f) => f.id === id && !f.deletedAt));
  if (!own.length) return 0;
  const all = [...own, ...descendantIds(folders, own)];
  const now = new Date();
  await db.$transaction([
    db.driveFolder.updateMany({ where: { userId, id: { in: all }, deletedAt: null }, data: { deletedAt: now } }),
    db.driveFile.updateMany({ where: { userId, folderId: { in: all }, deletedAt: null }, data: { deletedAt: now } }),
  ]);
  return own.length;
}

/** Restores a folder and what was trashed with it (same timestamp). Moves it to the root if its parent is still trashed. */
export async function restoreFolder(userId: string, id: string) {
  const folders = await allFolders(userId);
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw notFound("Folder");
  if (!folder.deletedAt) return folder;
  const at = folder.deletedAt;
  const parent = folder.parentId ? folders.find((f) => f.id === folder.parentId) : null;
  const subtree = [id, ...descendantIds(folders, [id])];
  const sameBatch = folders.filter((f) => subtree.includes(f.id) && f.deletedAt?.getTime() === at.getTime()).map((f) => f.id);
  await db.$transaction([
    db.driveFolder.updateMany({ where: { userId, id: { in: sameBatch } }, data: { deletedAt: null } }),
    db.driveFile.updateMany({ where: { userId, folderId: { in: sameBatch }, deletedAt: at }, data: { deletedAt: null } }),
    ...(parent?.deletedAt || (folder.parentId && !parent) ? [db.driveFolder.update({ where: { id }, data: { parentId: null } })] : []),
  ]);
  return db.driveFolder.findFirstOrThrow({ where: { id, userId } });
}

/** Restores trashed files; files whose folder is gone or trashed go back to the root. */
export async function restoreFiles(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const files = await db.driveFile.findMany({ where: { userId, id: { in: ids } }, include: { folder: true } });
  const orphaned = files.filter((f) => f.folderId && (!f.folder || f.folder.deletedAt)).map((f) => f.id);
  await db.$transaction([
    db.driveFile.updateMany({ where: { userId, id: { in: files.map((f) => f.id) } }, data: { deletedAt: null } }),
    ...(orphaned.length ? [db.driveFile.updateMany({ where: { userId, id: { in: orphaned } }, data: { folderId: null } })] : []),
  ]);
  return files.length;
}

const REFS = {
  journal: true,
  memories: true,
  photos: true,
  bucketItems: true,
  timeline: true,
  albumCovers: true,
  receipts: true,
  driveFiles: true,
} satisfies Prisma.MediaFileCountOutputTypeSelect;

/**
 * Permanently removes Drive files. The stored object and MediaFile row go too, unless something else
 * (a journal entry, memory, another Drive file…) still uses that MediaFile.
 */
export async function purgeFiles(userId: string, ids: string[]) {
  if (!ids.length) return { files: 0, objects: 0 };
  const files = await db.driveFile.findMany({ where: { userId, id: { in: ids } }, select: { id: true, mediaId: true } });
  if (!files.length) return { files: 0, objects: 0 };
  await db.driveFile.deleteMany({ where: { userId, id: { in: files.map((f) => f.id) } } });
  const mediaIds = [...new Set(files.map((f) => f.mediaId))];
  const media = await db.mediaFile.findMany({ where: { userId, id: { in: mediaIds } }, include: { _count: { select: REFS } } });
  const unused = media.filter((m) => Object.values(m._count).every((n) => n === 0));
  if (unused.length) {
    await db.mediaFile.deleteMany({ where: { userId, id: { in: unused.map((m) => m.id) } } });
    await deleteObjects(unused.map((m) => m.storageKey)).catch((err) => console.error("[drive] object delete failed", err));
  }
  return { files: files.length, objects: unused.length };
}

/** Permanently deletes folders with all their subfolders and files. */
export async function purgeFolders(userId: string, ids: string[]) {
  if (!ids.length) return { folders: 0, files: 0, objects: 0 };
  const folders = await allFolders(userId);
  const own = ids.filter((id) => folders.some((f) => f.id === id));
  if (!own.length) return { folders: 0, files: 0, objects: 0 };
  const all = [...own, ...descendantIds(folders, own)];
  const files = await db.driveFile.findMany({ where: { userId, folderId: { in: all } }, select: { id: true } });
  const r = await purgeFiles(userId, files.map((f) => f.id));
  await db.driveFolder.deleteMany({ where: { userId, id: { in: all } } });
  return { folders: all.length, ...r };
}
