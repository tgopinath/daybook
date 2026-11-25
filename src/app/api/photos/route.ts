import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { DAY_RE, assertCollection, normalizeTags, serializePhoto } from "@/lib/memories";

const photoInclude = { media: true, collection: { select: { id: true, title: true } } } satisfies Prisma.PhotoEntryInclude;

/**
 * Photo Diary, newest day first, cursor-paginated.
 * Filters: scope=trash (archived → always empty: photos have no archive), collectionId (or "none"), tag, favorite=1, q.
 * The first page adds `months` ([{ key: "yyyy-MM", count }]), `tags` ([{ tag, count }]) and `total`.
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  if (scope === "archived") return { items: [], nextCursor: null, months: [], tags: [], total: 0 };
  const where: Prisma.PhotoEntryWhereInput = { userId: user.id, media: { status: "ready" } };
  where.deletedAt = scope === "trash" ? { not: null } : null;
  const collectionId = sp.get("collectionId");
  if (collectionId) where.collectionId = collectionId === "none" ? null : collectionId;
  const tag = sp.get("tag");
  if (tag) where.tags = { has: tag.toLowerCase() };
  if (sp.get("favorite") === "1") where.favorite = true;
  const q = sp.get("q")?.trim();
  if (q) where.OR = [{ caption: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase().replace(/^#/, "") } }];

  const take = Math.min(Math.max(Number(sp.get("limit")) || 60, 1), 200);
  const cursor = sp.get("cursor");
  const rows = await db.photoEntry.findMany({
    where,
    include: photoInclude,
    orderBy: scope === "trash" ? [{ deletedAt: "desc" }, { id: "desc" }] : [{ takenOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  const out: Record<string, unknown> = { items: page.map(serializePhoto), nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
  if (!cursor) {
    const days = await db.photoEntry.findMany({ where, select: { takenOn: true } });
    const months = new Map<string, number>();
    for (const d of days) months.set(d.takenOn.slice(0, 7), (months.get(d.takenOn.slice(0, 7)) ?? 0) + 1);
    out.months = [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, count]) => ({ key, count }));
    out.total = days.length;
    const all = await db.photoEntry.findMany({ where: { userId: user.id, deletedAt: null }, select: { tags: true } });
    const tags = new Map<string, number>();
    for (const r of all) for (const t of r.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    out.tags = [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, count]) => ({ tag: t, count }));
  }
  return out;
});

const itemSchema = z.object({
  mediaId: z.string().max(40),
  caption: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  takenOn: z.string().regex(DAY_RE, "takenOn must be yyyy-MM-dd").optional(),
  collectionId: z.string().max(40).nullable().optional(),
  favorite: z.boolean().optional(),
});
const createSchema = z.union([itemSchema, z.object({ items: z.array(itemSchema).min(1).max(100) })]);

/** Adds uploaded files to the Photo Diary: `{ mediaId, … }` or `{ items: [...] }`. Images and videos only. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  const tz = tzOf(req);
  const items = "items" in input ? input.items : [input];
  const ids = [...new Set(items.map((i) => i.mediaId))];
  const media = await db.mediaFile.findMany({ where: { id: { in: ids }, userId: user.id, status: "ready" } });
  if (media.length !== ids.length) throw new ApiError(400, "Some photos weren't found or haven't finished uploading");
  if (media.some((m) => m.kind !== "image" && m.kind !== "video")) throw new ApiError(400, "Only photos and videos can be added to the Photo Diary");
  for (const c of new Set(items.map((i) => i.collectionId).filter(Boolean))) await assertCollection(user.id, c);
  const byId = new Map(media.map((m) => [m.id, m]));
  const today = dayKey(new Date(), tz);
  const created = await db.$transaction(
    items.map((i) => {
      const m = byId.get(i.mediaId)!;
      return db.photoEntry.create({
        data: {
          userId: user.id,
          mediaId: m.id,
          caption: i.caption || null,
          tags: normalizeTags(i.tags ?? []),
          takenOn: i.takenOn ?? (m.takenAt ? dayKey(m.takenAt, tz) : today),
          collectionId: i.collectionId || null,
          favorite: i.favorite ?? false,
        },
        include: photoInclude,
      });
    }),
  );
  const out = created.map(serializePhoto);
  return "items" in input ? { items: out } : { item: out[0] };
});
