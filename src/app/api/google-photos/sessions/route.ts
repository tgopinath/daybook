import { parseSession, pickerFetch, pickerWindowUrl } from "@/lib/google-photos";
import { assertAvailable, gpRoute, requireToken } from "../_lib";

/** Creates a Picker session. The client opens `pickerWindowUrl` in a new tab and polls the session. */
export const POST = gpRoute(async ({ user }) => {
  assertAvailable(user);
  const token = await requireToken(user.id);
  const session = parseSession(await pickerFetch(token, "/sessions", { method: "POST", body: JSON.stringify({ pickingConfig: { maxItemCount: "200" } }) }));
  return {
    id: session.id,
    pickerUri: session.pickerUri,
    pickerWindowUrl: session.pickerUri ? pickerWindowUrl(session.pickerUri) : null,
    pollIntervalMs: session.pollIntervalMs,
    timeoutMs: session.timeoutMs,
    expireTime: session.expireTime,
  };
});
