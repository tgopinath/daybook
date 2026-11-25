import { z } from "zod";
import { ApiError, body, route } from "@/lib/api";
import { checkCode, replaceBackupCodes } from "@/lib/two-factor";
import { assertThrottle } from "../../guard";

const schema = z.object({ code: z.string().max(20) });

/** Replaces the backup codes (old ones stop working). Needs a current authenticator code. */
export const POST = route(async ({ req, user }) => {
  assertThrottle(`2fa-backup:${user.id}`, 8);
  const input = await body(req, schema);
  const r = await checkCode(user.id, input.code);
  if (r === "unavailable") throw new ApiError(409, "Turn on two-step verification first");
  if (r === "throttled") throw new ApiError(429, "Too many incorrect codes. Try again in an hour.");
  if (r !== "ok") throw new ApiError(400, "That code didn't work");
  const backupCodes = await replaceBackupCodes(user.id);
  return new Response(JSON.stringify({ backupCodes }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
});
