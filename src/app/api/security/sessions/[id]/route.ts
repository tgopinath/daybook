import { db } from "@/lib/db";
import { ApiError, notFound, route } from "@/lib/api";
import { getCurrentSession } from "@/lib/auth";

/** Signs out one device. This device signs out through the normal Sign out instead. */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const current = await getCurrentSession();
  if (current?.id === params.id) throw new ApiError(400, "Use Sign out to sign out of this device");
  const { count } = await db.session.deleteMany({ where: { id: params.id, userId: user.id } });
  if (count === 0) throw notFound("Session");
  return { ok: true };
});
