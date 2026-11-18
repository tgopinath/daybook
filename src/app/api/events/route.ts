import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";
import {
  assertCategory,
  eventCreateSchema,
  eventInclude,
  getOwnedEvent,
  loadEventsInRange,
  parseRange,
  serializeEvent,
  setLinkedTasks,
  syncEventReminder,
} from "./_lib";

/**
 * GET /api/events?from=ISO&to=ISO[&kinds=birthday,important]
 *   → occurrences overlapping the range (recurring events expanded).
 * GET /api/events → upcoming, non-deleted events (for pickers).
 * GET /api/events?scope=trash → deleted events; ?scope=archived → [] (events can't be archived).
 */
export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  if (scope === "archived") return { items: [] };
  if (scope === "trash") {
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id, deletedAt: { not: null } }, include: eventInclude, orderBy: { deletedAt: "desc" }, take: 500 });
    return { items: rows.map(serializeEvent) };
  }
  const kinds = sp.get("kinds")?.split(",").filter(Boolean);
  const range = parseRange(sp);
  if (range) return { items: await loadEventsInRange(user.id, range.from, range.to, kinds) };

  const now = new Date();
  const rows = await db.calendarEvent.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(kinds?.length ? { kind: { in: kinds } } : {}),
      OR: [{ end: { gte: now } }, { recurrence: { not: "NONE" } }],
    },
    include: eventInclude,
    orderBy: { start: "asc" },
    take: 200,
  });
  return { items: rows.map(serializeEvent) };
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, eventCreateSchema);
  await assertCategory(user.id, input.categoryId);
  const created = await db.calendarEvent.create({
    data: {
      userId: user.id,
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      kind: input.kind,
      color: input.color ?? null,
      categoryId: input.categoryId || null,
      recurrence: input.recurrence,
    },
  });
  if (input.reminderMinutes != null) await syncEventReminder(user.id, created, input.reminderMinutes, null);
  if (input.taskIds?.length) await setLinkedTasks(user.id, created.id, input.taskIds);
  const full = await getOwnedEvent(user.id, created.id);
  return { item: serializeEvent(full!) };
});
