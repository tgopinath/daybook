import { db } from "@/lib/db";
import { route } from "@/lib/api";

/**
 * Storage used by the user: every ready MediaFile (My Storage plus photos, journal, memories, receipts…),
 * broken down by kind. Display only — no quota is enforced.
 */
export const GET = route(async ({ user }) => {
  const [byKind, driveFiles, trashed] = await Promise.all([
    db.mediaFile.groupBy({ by: ["kind"], where: { userId: user.id, status: "ready" }, _sum: { size: true }, _count: { _all: true } }),
    db.driveFile.count({ where: { userId: user.id, deletedAt: null } }),
    db.driveFile.count({ where: { userId: user.id, deletedAt: { not: null } } }),
  ]);
  const kinds = byKind
    .map((k) => ({ kind: k.kind, bytes: k._sum.size ?? 0, count: k._count._all }))
    .sort((a, b) => b.bytes - a.bytes);
  return {
    totalBytes: kinds.reduce((s, k) => s + k.bytes, 0),
    kinds,
    driveFiles,
    trashedFiles: trashed,
  };
});
