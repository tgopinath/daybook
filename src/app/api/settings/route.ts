import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { isValidTz } from "@/lib/time";
import { publicSettings } from "@/lib/public-settings";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

const schema = z
  .object({
    timezone: z.string().refine(isValidTz, "Unknown time zone"),
    language: z.literal("en"),
    theme: z.enum(["light", "dark", "system"]),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #635BFF"),
    density: z.enum(["comfortable", "compact"]),
    defaultPriority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    workStart: hhmm,
    workEnd: hhmm,
    weekStart: z.number().int().min(0).max(6),
    planningTime: hhmm,
    browserNotifications: z.boolean(),
    // Email delivery isn't configured on this server, so it can only be turned off.
    emailNotifications: z.literal(false),
    reminderLeadMinutes: z.number().int().min(0).max(24 * 60),
    defaultSnoozeMinutes: z.number().int().min(1).max(24 * 60),
    notifyOverdue: z.boolean(),
    notifyHabits: z.boolean(),
    notifyCalendar: z.boolean(),
    notifyAI: z.boolean(),
  })
  .partial()
  .strict();

export const GET = route(async ({ user }) => {
  const settings = await db.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  return { settings: publicSettings(settings) };
});

export const PATCH = route(async ({ req, user }) => {
  const input = await body(req, schema);
  const current = await db.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const workStart = input.workStart ?? current.workStart;
  const workEnd = input.workEnd ?? current.workEnd;
  if (workEnd <= workStart) return Response.json({ error: "Working hours must end after they start" }, { status: 400 });
  const settings = await db.userSettings.update({ where: { userId: user.id }, data: input });
  return { settings: publicSettings(settings) };
});
