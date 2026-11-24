import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { destroySession, throttle, verifyPassword } from "@/lib/auth";
import { hasPassword } from "@/lib/google";
import { deleteObjects } from "@/lib/storage";

const schema = z.object({ email: z.string().trim().toLowerCase(), password: z.string().optional() });

/** Hard-deletes the account; every user-owned row cascades. */
export const POST = route(async ({ req, user }) => {
  if (!throttle(`delete:${user.id}`, 5)) throw new ApiError(429, "Too many attempts. Try again later.");
  const input = await body(req, schema);
  if (input.email !== user.email.toLowerCase()) throw new ApiError(400, "Type your account email exactly to confirm");
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row) throw new ApiError(404, "Account not found");
  // Accounts without a password (Google sign-in) confirm with their typed email alone; they're already signed in.
  if (hasPassword(row.passwordHash) && !(await verifyPassword(input.password ?? "", row.passwordHash))) throw new ApiError(400, "Password is incorrect");
  // Stored photos and files aren't covered by the database cascade, so remove them too.
  const media = await db.mediaFile.findMany({ where: { userId: user.id }, select: { storageKey: true } });
  await destroySession();
  await db.user.delete({ where: { id: user.id } });
  await deleteObjects(media.map((m) => m.storageKey)).catch((err) => console.error("[account] media cleanup failed", err));
  return { ok: true };
});
