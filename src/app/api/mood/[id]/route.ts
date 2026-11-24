import { db } from "@/lib/db";
import { ApiError, body, notFound, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { moodInput, moodSelect, serializeMood } from "../_lib/shared";

const patchInput = moodInput.partial().omit({ journalEntryId: true });

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const row = await db.moodEntry.findFirst({ where: { id: params.id, userId: user.id }, select: moodSelect });
  if (!row) throw notFound("Check-in");
  return { item: serializeMood(row) };
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchInput);
  const existing = await db.moodEntry.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!existing) throw notFound("Check-in");
  if (input.date && input.date > dayKey(new Date(), tzOf(req))) throw new ApiError(400, "You can't log a mood for a future day");
  const row = await db.moodEntry.update({
    where: { id: existing.id },
    data: {
      ...(input.mood ? { mood: input.mood } : {}),
      ...(input.intensity ? { intensity: input.intensity } : {}),
      ...(input.note !== undefined ? { note: input.note || null } : {}),
      ...(input.factors ? { factors: input.factors } : {}),
      ...(input.date ? { date: input.date } : {}),
    },
    select: moodSelect,
  });
  return { item: serializeMood(row) };
});

/** Check-ins are small; deletes are permanent (the UI confirms first). */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const { count } = await db.moodEntry.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!count) throw notFound("Check-in");
  return { ok: true };
});
