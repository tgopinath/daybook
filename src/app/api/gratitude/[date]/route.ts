import { z } from "zod";
import { db } from "@/lib/db";
import { body, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { cleanItems, gratitudeStreak, promptForDay } from "@/lib/gratitude";
import { assertDay, serializeGratitude } from "../_lib";

async function streakFor(userId: string, todayKey: string) {
  const rows = await db.gratitudeEntry.findMany({ where: { userId }, select: { date: true, items: true } });
  return gratitudeStreak(rows.filter((r) => r.items.some((i) => i.trim())).map((r) => r.date), todayKey);
}

export const GET = route<{ date: string }>(async ({ req, user, params }) => {
  const today = dayKey(new Date(), tzOf(req));
  assertDay(params.date, today);
  const e = await db.gratitudeEntry.findUnique({ where: { userId_date: { userId: user.id, date: params.date } } });
  return { date: params.date, prompt: e?.prompt ?? promptForDay(params.date), item: e ? serializeGratitude(e) : null };
});

const putSchema = z.object({
  items: z.array(z.string().max(500)).max(3),
  note: z.string().max(5000).nullable().optional(),
});

/** Upsert the day's entry. Saving it empty (no items, no note) removes it. */
export const PUT = route<{ date: string }>(async ({ req, user, params }) => {
  const today = dayKey(new Date(), tzOf(req));
  assertDay(params.date, today);
  const input = await body(req, putSchema);
  // Keep positions (so the 2nd box stays the 2nd) but trim; drop trailing empties.
  const items = input.items.map((s) => s.trim());
  while (items.length && !items[items.length - 1]) items.pop();
  const note = input.note?.trim() || null;
  const key = { userId_date: { userId: user.id, date: params.date } };
  if (!cleanItems(items).length && !note) {
    await db.gratitudeEntry.deleteMany({ where: { userId: user.id, date: params.date } });
    return { date: params.date, item: null, streak: await streakFor(user.id, today) };
  }
  const e = await db.gratitudeEntry.upsert({
    where: key,
    update: { items, note },
    create: { userId: user.id, date: params.date, items, note, prompt: promptForDay(params.date) },
  });
  return { date: params.date, item: serializeGratitude(e), streak: await streakFor(user.id, today) };
});

/** Clear the day (hard delete; the client confirms first). */
export const DELETE = route<{ date: string }>(async ({ req, user, params }) => {
  assertDay(params.date, dayKey(new Date(), tzOf(req)));
  await db.gratitudeEntry.deleteMany({ where: { userId: user.id, date: params.date } });
  return { ok: true };
});
