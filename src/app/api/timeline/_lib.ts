import "server-only";
import { z } from "zod";
import type { MediaFile, TimelineEvent, TimelineMedia } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api";
import { serializeMedia } from "@/lib/media";
import { DATE_PRECISIONS, TIMELINE_CATEGORIES } from "@/components/timeline/meta";

export const TIMELINE_DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export const timelineFields = {
  title: z.string().trim().min(1, "Give it a title").max(200),
  description: z.string().max(10_000).nullable().optional(),
  /** yyyy, yyyy-MM or yyyy-MM-dd */
  date: z.string().regex(TIMELINE_DATE_RE, "Use a year, month or day"),
  datePrecision: z.enum(DATE_PRECISIONS).optional(),
  category: z.enum(TIMELINE_CATEGORIES).optional(),
  mediaIds: z.array(z.string().min(1).max(64)).max(30).optional(),
};

/** Parses a partial date; returns noon UTC of its first day plus the precision it implies. */
export function parseTimelineDate(s: string, precision?: (typeof DATE_PRECISIONS)[number]) {
  const [y, m, d] = s.split("-").map(Number);
  const implied = d ? "day" : m ? "month" : "year";
  const p = precision ?? implied;
  const month = p === "year" ? 1 : (m ?? 1);
  const day = p === "day" ? (d ?? 1) : 1;
  const date = new Date(Date.UTC(y!, month - 1, day, 12));
  return { date, datePrecision: p };
}

export const eventInclude = { media: { include: { media: true }, orderBy: { sortOrder: "asc" as const } } };

type Row = TimelineEvent & { media: (TimelineMedia & { media: MediaFile })[] };

export function serializeEvent(e: Row) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date,
    dateKey: e.date.toISOString().slice(0, 10),
    datePrecision: e.datePrecision,
    category: e.category,
    media: e.media.filter((m) => m.media.status === "ready").map((m) => serializeMedia(m.media)),
    deletedAt: e.deletedAt,
    archivedAt: null,
    isDemo: e.isDemo,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function findEvent(userId: string, id: string) {
  const e = await db.timelineEvent.findFirst({ where: { id, userId } });
  if (!e) throw notFound("Timeline event");
  return e;
}
