import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { throttle, verifyPassword } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo-mode";
import { hasPassword } from "@/lib/google";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), currentPassword: z.string().min(1, "Enter your current password") });

export const POST = route(async ({ req, user }) => {
  if (!throttle(`email:${user.id}`, 8)) throw new ApiError(429, "Too many attempts. Try again later.");
  const input = await body(req, schema);
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (isDemoEmail(user.email)) throw new ApiError(403, "Demo accounts can't change their email");
  if (row && !hasPassword(row.passwordHash)) throw new ApiError(400, "Set a password first (Settings → Password), then change your email");
  if (!row || !(await verifyPassword(input.currentPassword, row.passwordHash))) throw new ApiError(400, "Current password is incorrect");
  if (input.email === user.email) return { email: user.email };
  const taken = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (taken) throw new ApiError(409, "That email is already in use");
  await db.user.update({ where: { id: user.id }, data: { email: input.email } });
  return { email: input.email };
});
