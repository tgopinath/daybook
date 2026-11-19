import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { createSession, hashPassword, throttle, verifyPassword } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo-mode";
import { hasPassword } from "@/lib/google";

const schema = z.object({
  // Optional only for accounts that don't have a password yet (created through Google sign-in).
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Use at least 8 characters").max(200),
});

/** Changes the password and signs out every other session. */
export const POST = route(async ({ req, user }) => {
  if (!throttle(`password:${user.id}`, 8)) throw new ApiError(429, "Too many attempts. Try again later.");
  const input = await body(req, schema);
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row) throw new ApiError(404, "Account not found");
  if (hasPassword(row.passwordHash)) {
    if (!input.currentPassword) throw new ApiError(400, "Enter your current password");
    if (!(await verifyPassword(input.currentPassword, row.passwordHash))) throw new ApiError(400, "Current password is incorrect");
  } else if (isDemoEmail(user.email)) {
    throw new ApiError(403, "Demo accounts can't set a password");
  }
  if (input.currentPassword === input.newPassword) throw new ApiError(400, "Choose a password you haven't used here");
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await createSession(user.id);
  return { ok: true };
});
