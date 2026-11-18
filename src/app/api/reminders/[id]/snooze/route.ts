import { z } from "zod";
import { ApiError, body, route } from "@/lib/api";
import { snoozeReminder } from "@/lib/dispatcher";
import { findReminder, withLinks } from "../../_shared";

const schema = z.object({
  minutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
  until: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
});

/** Body: { minutes } or { until: ISO }. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const r = await findReminder(user.id, params.id);
  const input = await body(req, schema);
  const until = input.until ? new Date(input.until) : input.minutes ? new Date(Date.now() + input.minutes * 60000) : null;
  if (!until) throw new ApiError(400, "minutes or until is required");
  if (until.getTime() <= Date.now()) throw new ApiError(400, "Snooze time must be in the future");
  const updated = await snoozeReminder(r, until);
  const [item] = await withLinks(user.id, [updated]);
  return { item };
});
