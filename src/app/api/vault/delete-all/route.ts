import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

/** Permanently delete every vault item (including recently deleted ones). */
export const POST = route(async ({ req, user }) => {
  await body(req, z.object({ confirm: z.literal("DELETE") }));
  const res = await db.vaultItem.deleteMany({ where: { userId: user.id } });
  return { deleted: res.count };
});
