import { ApiError } from "@/lib/api";
import { parseSession, pickerFetch } from "@/lib/google-photos";
import { assertAvailable, gpRoute, requireToken } from "../../_lib";

const validId = (id: string) => {
  if (!/^[\w.-]{1,200}$/.test(id)) throw new ApiError(400, "Invalid session");
  return id;
};

/** Poll target: `{ mediaItemsSet, pollIntervalMs, timeoutMs }`. */
export const GET = gpRoute<{ id: string }>(async ({ user, params }) => {
  assertAvailable(user);
  const token = await requireToken(user.id);
  const s = parseSession(await pickerFetch(token, `/sessions/${encodeURIComponent(validId(params.id))}`));
  return { id: s.id, mediaItemsSet: s.mediaItemsSet, pollIntervalMs: s.pollIntervalMs, timeoutMs: s.timeoutMs, expireTime: s.expireTime };
});

/** Cancels a picker session. */
export const DELETE = gpRoute<{ id: string }>(async ({ user, params }) => {
  const token = await requireToken(user.id);
  await pickerFetch(token, `/sessions/${encodeURIComponent(validId(params.id))}`, { method: "DELETE" });
  return { ok: true };
});
