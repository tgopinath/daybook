import { z } from "zod";
import { db } from "@/lib/db";
import { body, query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { assertOwnMedia } from "../bucket-list/_lib";
import { eventInclude, parseTimelineDate, serializeEvent, timelineFields } from "./_lib";

/**
 * GET /api/timeline — live events, oldest first.
 * ?scope=trash → deleted events; ?scope=archived → [] (events can't be archived).
 * ?related=1 also returns memories and completed bucket list items as lighter "related" entries.
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  if (scope === "archived") return { items: [] };
  if (scope === "trash") {
    const rows = await db.timelineEvent.findMany({ where: { userId: user.id, deletedAt: { not: null } }, include: eventInclude, orderBy: { deletedAt: "desc" }, take: 1000 });
    return { items: rows.map(serializeEvent) };
  }
  const rows = await db.timelineEvent.findMany({ where: { userId: user.id, deletedAt: null }, include: eventInclude, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 2000 });
  const items = rows.map(serializeEvent);
  if (sp.get("related") !== "1") return { items };

  const tz = tzOf(req);
  const [memories, bucket] = await Promise.all([
    db.memory
      .findMany({ where: { userId: user.id, deletedAt: null, archivedAt: null }, select: { id: true, title: true, date: true, location: true }, orderBy: { date: "asc" }, take: 500 })
      .catch(() => []),
    db.bucketItem
      .findMany({ where: { userId: user.id, deletedAt: null, completedAt: { not: null } }, select: { id: true, title: true, completedAt: true, category: true }, orderBy: { completedAt: "asc" }, take: 500 })
      .catch(() => []),
  ]);
  const related = [
    ...memories.map((m) => ({ id: m.id, kind: "memory" as const, title: m.title, subtitle: m.location ?? null, dateKey: dayKey(m.date, tz), href: `/memories?id=${m.id}` })),
    ...bucket.map((b) => ({ id: b.id, kind: "bucket" as const, title: b.title, subtitle: b.category, dateKey: dayKey(b.completedAt!, tz), href: `/bucket-list?id=${b.id}` })),
  ].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return { items, related };
});

const createSchema = z.object(timelineFields);

export const POST = route(async ({ req, user }) => {
  const { date, datePrecision, mediaIds = [], ...input } = await body(req, createSchema);
  await assertOwnMedia(user.id, mediaIds);
  const parsed = parseTimelineDate(date, datePrecision);
  const event = await db.timelineEvent.create({
    data: {
      ...input,
      ...parsed,
      userId: user.id,
      media: { create: [...new Set(mediaIds)].map((mediaId, i) => ({ mediaId, sortOrder: i })) },
    },
    include: eventInclude,
  });
  return { item: serializeEvent(event) };
});
