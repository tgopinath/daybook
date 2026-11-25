import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { assertCollection, normalizeTags, purgePhotos } from "@/lib/memories";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("favorite"), ids: z.array(z.string()).min(1).max(500), value: z.boolean() }),
  z.object({ action: z.literal("collection"), ids: z.array(z.string()).min(1).max(500), collectionId: z.string().max(40).nullable() }),
  z.object({ action: z.literal("addTags"), ids: z.array(z.string()).min(1).max(500), tags: z.array(z.string().max(40)).min(1).max(30) }),
  z.object({ action: z.literal("removeTags"), ids: z.array(z.string()).min(1).max(500), tags: z.array(z.string().max(40)).min(1).max(30) }),
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1).max(500) }),
  z.object({ action: z.literal("restore"), ids: z.array(z.string()).min(1).max(500) }),
  z.object({ action: z.literal("deletePermanent"), ids: z.array(z.string()).min(1).max(500) }),
]);

/** Bulk actions for select mode. Returns how many photos changed. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, schema);
  const where = { id: { in: [...new Set(input.ids)] }, userId: user.id };
  switch (input.action) {
    case "favorite":
      return { count: (await db.photoEntry.updateMany({ where, data: { favorite: input.value } })).count };
    case "collection":
      await assertCollection(user.id, input.collectionId);
      return { count: (await db.photoEntry.updateMany({ where, data: { collectionId: input.collectionId } })).count };
    case "delete":
      return { count: (await db.photoEntry.updateMany({ where: { ...where, deletedAt: null }, data: { deletedAt: new Date() } })).count };
    case "restore":
      return { count: (await db.photoEntry.updateMany({ where, data: { deletedAt: null } })).count };
    case "deletePermanent":
      return { count: await purgePhotos(user.id, input.ids) };
    case "addTags":
    case "removeTags": {
      const tags = normalizeTags(input.tags);
      const rows = await db.photoEntry.findMany({ where, select: { id: true, tags: true } });
      await db.$transaction(
        rows.map((r) =>
          db.photoEntry.update({
            where: { id: r.id },
            data: { tags: input.action === "addTags" ? normalizeTags([...r.tags, ...tags]) : r.tags.filter((t) => !tags.includes(t)) },
          }),
        ),
      );
      return { count: rows.length };
    }
  }
});
