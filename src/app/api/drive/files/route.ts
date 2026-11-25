import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, query, route } from "@/lib/api";
import { DRIVE_FILTERS, DRIVE_SORTS, PAGE_SIZE, RECENT_DAYS, cleanName, descendantIds, folderPathLabel, kindsForFilter, type DriveFilter, type DriveSort } from "@/lib/drive";
import { allFolders, assertFolder, serializeFile, serializeFolder } from "../_lib";

const createSchema = z.object({
  mediaId: z.string().min(1).max(40),
  name: z.string().max(400).optional(),
  folderId: z.string().max(40).nullable().optional(),
});

// Opaque cursor: the offset into the sorted result ("o:120"), so every sort order paginates the same way.
const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`).toString("base64url");
function decodeCursor(raw: string | null) {
  if (!raw) return 0;
  const m = /^o:(\d{1,7})$/.exec(Buffer.from(raw, "base64url").toString("utf8"));
  return m ? Number(m[1]) : 0;
}

function orderBy(sort: DriveSort, dir: "asc" | "desc"): Prisma.DriveFileOrderByWithRelationInput[] {
  if (sort === "name") return [{ name: dir }, { id: dir }];
  if (sort === "size") return [{ media: { size: dir } }, { id: dir }];
  if (sort === "type") return [{ media: { mimeType: dir } }, { name: "asc" }, { id: "asc" }];
  return [{ createdAt: dir }, { id: dir }];
}

/**
 * Lists Drive files.
 * - `folderId` (omit or "root" for the top level) — the folder's files plus its subfolders (`folders`)
 * - `filter`: starred | recent | photos | videos | documents | trash (all folders); `scope=trash` = filter=trash
 * - `q`: search by file name or folder path (all folders), also returns matching folders
 * - `sort`: name | date | size | type, `dir`: asc | desc, `cursor` + `limit` for pages
 */
export const GET = route(async ({ req, user }) => {
  const q = query(req);
  const scope = q.get("scope");
  if (scope === "archived") return { items: [], folders: [], nextCursor: null };
  const rawFilter = scope === "trash" ? "trash" : (q.get("filter") ?? "all");
  const filter: DriveFilter = (DRIVE_FILTERS as string[]).includes(rawFilter) ? (rawFilter as DriveFilter) : "all";
  const rawSort = q.get("sort") ?? (filter === "recent" ? "date" : "name");
  const sort: DriveSort = (DRIVE_SORTS as string[]).includes(rawSort) ? (rawSort as DriveSort) : "name";
  const dir = q.get("dir") === "desc" || (q.get("dir") !== "asc" && sort === "date") ? "desc" : "asc";
  const take = Math.min(Math.max(Number(q.get("limit")) || PAGE_SIZE, 1), 200);
  const offset = decodeCursor(q.get("cursor"));
  const search = (q.get("q") ?? "").trim().slice(0, 100);
  const folderParam = q.get("folderId");
  const folderId = folderParam && folderParam !== "root" ? folderParam : null;

  const folders = await allFolders(user.id);
  const live = folders.filter((f) => !f.deletedAt);
  const trashedIds = new Set(folders.filter((f) => f.deletedAt).map((f) => f.id));

  const where: Prisma.DriveFileWhereInput = { userId: user.id };
  let subfolders: typeof folders = [];
  const browsing = filter === "all" && !search;

  if (filter === "trash") {
    // Trashed files, except those inside a trashed folder (they come back with the folder).
    where.deletedAt = { not: null };
    where.OR = [{ folderId: null }, { folderId: { notIn: [...trashedIds] } }];
  } else {
    where.deletedAt = null;
    if (browsing) {
      if (folderId && !live.some((f) => f.id === folderId)) throw new ApiError(404, "Folder not found");
      where.folderId = folderId;
      subfolders = live.filter((f) => f.parentId === folderId);
    }
    if (filter === "starred") where.starred = true;
    if (filter === "recent") where.createdAt = { gte: new Date(Date.now() - RECENT_DAYS * 86_400_000) };
    const kinds = kindsForFilter(filter);
    if (kinds) where.media = { kind: { in: kinds } };
  }

  let matchedFolders: typeof folders = [];
  if (search) {
    const needle = search.toLowerCase();
    const pool = filter === "trash" ? folders : live;
    // Folders whose own name matches; files anywhere beneath them match by path.
    matchedFolders = pool.filter((f) => f.name.toLowerCase().includes(needle));
    const underMatch = [...matchedFolders.map((f) => f.id), ...descendantIds(pool, matchedFolders.map((f) => f.id))];
    const nameOrPath: Prisma.DriveFileWhereInput[] = [{ name: { contains: search, mode: "insensitive" } }];
    if (underMatch.length) nameOrPath.push({ folderId: { in: underMatch } });
    where.AND = [{ OR: nameOrPath }];
  }

  const rows = await db.driveFile.findMany({ where, include: { media: true }, orderBy: orderBy(sort, dir), skip: offset, take: take + 1 });
  const page = rows.slice(0, take);
  const showPath = !browsing;
  const folderList = offset === 0 ? (browsing ? subfolders : search && filter !== "trash" ? matchedFolders.slice(0, 50) : []) : [];
  return {
    items: page.map((f) => serializeFile(f, showPath ? folderPathLabel(folders, f.folderId) : undefined)),
    folders: folderList.map((f) => ({ ...serializeFolder(f), path: folderPathLabel(folders, f.parentId) })),
    nextCursor: rows.length > take ? encodeCursor(offset + take) : null,
  };
});

/** Adds an uploaded file (a ready MediaFile of this user) to My Storage. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  const media = await db.mediaFile.findFirst({ where: { id: input.mediaId, userId: user.id, status: "ready" } });
  if (!media) throw new ApiError(404, "File not found — upload it again");
  const folderId = input.folderId || null;
  await assertFolder(user.id, folderId);
  const name = cleanName(input.name ?? media.originalName ?? "") ?? "Untitled";
  const file = await db.driveFile.create({ data: { userId: user.id, mediaId: media.id, folderId, name }, include: { media: true } });
  return { file: serializeFile(file) };
});
