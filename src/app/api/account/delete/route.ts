import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { destroySession, throttle, verifyPassword } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1, "Enter your password") });

/** Hard-deletes the account; every user-owned row cascades. */
export const POST = route(async ({ req, user }) => {
  if (!throttle(`delete:${user.id}`, 5)) throw new ApiError(429, "Too many attempts. Try again later.");
  const input = await body(req, schema);
  if (input.email !== user.email.toLowerCase()) throw new ApiError(400, "Type your account email exactly to confirm");
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(input.password, row.passwordHash))) throw new ApiError(400, "Password is incorrect");
  await destroySession();
  await db.user.delete({ where: { id: user.id } });
  return { ok: true };
});
