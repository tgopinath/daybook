import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

const schema = z.object({
  /** Item ids in their new visual order; each gets sortOrder = index. */
  order: z.array(z.string().min(1).max(64)).max(1000),
});

/** POST /api/bucket-list/reorder { order: string[] } */
export const POST = route(async ({ req, user }) => {
  const { order } = await body(req, schema);
  const owned = new Set((await db.bucketItem.findMany({ where: { userId: user.id, id: { in: order } }, select: { id: true } })).map((b) => b.id));
  await db.$transaction(order.filter((id) => owned.has(id)).map((id, i) => db.bucketItem.update({ where: { id }, data: { sortOrder: i } })));
  return { ok: true };
});
