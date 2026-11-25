import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { getCurrentSession } from "@/lib/auth";
import { checkCode, replaceBackupCodes } from "@/lib/two-factor";
import { assertNotDemo, assertThrottle } from "../../guard";

const schema = z.object({ code: z.string().max(20) });

/** Confirms setup with a code from the app, turns 2FA on, returns 10 backup codes (shown once) and signs out other devices. */
export const POST = route(async ({ req, user }) => {
  assertNotDemo(user.email);
  assertThrottle(`2fa-enable:${user.id}`, 10);
  const input = await body(req, schema);
  const r = await checkCode(user.id, input.code, { pending: true, enable: true });
  if (r === "unavailable") throw new ApiError(409, "Start the setup again");
  if (r === "throttled") throw new ApiError(429, "Too many incorrect codes. Start the setup again.");
  if (r !== "ok") throw new ApiError(400, "That code didn't work. Check the time on your phone and try the newest code.");
  const backupCodes = await replaceBackupCodes(user.id);
  const session = await getCurrentSession();
  const { count } = await db.session.deleteMany({ where: { userId: user.id, ...(session ? { id: { not: session.id } } : {}) } });
  return new Response(JSON.stringify({ ok: true, backupCodes, signedOutOthers: count }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
