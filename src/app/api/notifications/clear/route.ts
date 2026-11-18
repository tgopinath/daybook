import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

/** Body: { scope: "read" | "all" } (default "read"). Permanently deletes notification rows. */
export const POST = route(async ({ req, user }) => {
  const { scope } = await body(req, z.object({ scope: z.enum(["read", "all"]).default("read") }));
  const { count } = await db.notification.deleteMany({
    where: scope === "all" ? { userId: user.id } : { userId: user.id, readAt: { not: null } },
  });
  return { ok: true, count };
});
