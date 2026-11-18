import { route } from "@/lib/api";
import { completeReminder } from "@/lib/dispatcher";
import { findReminder, userTz, withLinks } from "../../_shared";

/** One-time → COMPLETED. Recurring → acknowledges a pending snooze, else skips to the next occurrence. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const r = await findReminder(user.id, params.id);
  const updated = await completeReminder(r, await userTz(req, user.id));
  const [item] = await withLinks(user.id, [updated]);
  return { item };
});
