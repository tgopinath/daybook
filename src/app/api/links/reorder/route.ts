import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";

/** Saves a new order: `{ ids }` lists every link of the user, top to bottom. */
export const POST = route(async ({ req, user }) => {
  const { ids } = await body(req, z.object({ ids: z.array(z.string()).max(500) }));
  const owned = await db.appLink.count({ where: { userId: user.id, id: { in: ids } } });
  if (owned !== ids.length) throw new ApiError(400, "Unknown link in the new order");
  await db.$transaction(ids.map((id, i) => db.appLink.update({ where: { id }, data: { sortOrder: i + 1 } })));
  return { ok: true };
});
