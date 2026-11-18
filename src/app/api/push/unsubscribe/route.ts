import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

/** Body: { endpoint } removes one device; {} removes all of the user's devices. */
export const POST = route(async ({ req, user }) => {
  const { endpoint } = await body(req, z.object({ endpoint: z.string().max(2000).optional() }));
  const { count } = await db.pushSubscription.deleteMany({ where: { userId: user.id, ...(endpoint ? { endpoint } : {}) } });
  return { ok: true, removed: count };
});
