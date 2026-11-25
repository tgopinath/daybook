import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { assertOwnMedia, deleteUnusedMedia } from "../../bucket-list/_lib";
import { eventInclude, findEvent, parseTimelineDate, serializeEvent, timelineFields } from "../_lib";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => {
  const e = await db.timelineEvent.findFirst({ where: { id: params.id, userId: user.id }, include: eventInclude });
  if (!e) throw notFound("Timeline event");
  return { item: serializeEvent(e) };
});

const patchSchema = z
  .object({
    ...timelineFields,
    title: timelineFields.title.optional(),
    date: timelineFields.date.optional(),
    deletedAt: z.null().optional(),
    archived: z.boolean().optional(), // accepted for the shared contract; events can't be archived
  })
  .strict();

export const PATCH = route<P>(async ({ req, user, params }) => {
  const existing = await findEvent(user.id, params.id);
  const { date, datePrecision, mediaIds, deletedAt, archived: _a, ...input } = await body(req, patchSchema);
  const data: Prisma.TimelineEventUncheckedUpdateInput = { ...input };
  if (date !== undefined) Object.assign(data, parseTimelineDate(date, datePrecision));
  else if (datePrecision) Object.assign(data, parseTimelineDate(existing.date.toISOString().slice(0, 10), datePrecision));
  if (deletedAt === null) data.deletedAt = null;

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (mediaIds) {
    const ids = [...new Set(mediaIds)];
    await assertOwnMedia(user.id, ids);
    ops.push(
      db.timelineMedia.deleteMany({ where: { eventId: existing.id } }),
      db.timelineMedia.createMany({ data: ids.map((mediaId, i) => ({ eventId: existing.id, mediaId, sortOrder: i })) }),
    );
  }
  ops.push(db.timelineEvent.update({ where: { id: existing.id }, data }));
  await db.$transaction(ops);
  const e = await db.timelineEvent.findFirstOrThrow({ where: { id: existing.id }, include: eventInclude });
  return { item: serializeEvent(e) };
});

/** Soft delete; ?permanent=1 deletes the event and photos nothing else uses. */
export const DELETE = route<P>(async ({ req, user, params }) => {
  const e = await findEvent(user.id, params.id);
  if (query(req).get("permanent") === "1") {
    const links = await db.timelineMedia.findMany({ where: { eventId: e.id }, select: { mediaId: true } });
    await db.timelineEvent.delete({ where: { id: e.id } });
    await deleteUnusedMedia(user.id, links.map((l) => l.mediaId));
    return { ok: true, permanent: true };
  }
  await db.timelineEvent.update({ where: { id: e.id }, data: { deletedAt: new Date() } });
  return { ok: true };
});
