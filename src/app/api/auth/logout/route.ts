import { cookies } from "next/headers";
import { route } from "@/lib/api";
import { clearCookie, destroySession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO_COOKIE, isDemoEmail } from "@/lib/demo-mode";

/** Signs out. Leaving a demo ("Exit demo" or Sign out) also deletes that throwaway sample account. */
export const POST = route(async () => {
  const user = await getCurrentUser();
  await destroySession();
  if (user && isDemoEmail(user.email)) {
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    clearCookie(await cookies(), DEMO_COOKIE);
  }
  return { ok: true };
}, { auth: false });
