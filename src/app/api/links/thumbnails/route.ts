import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { findThumbnail } from "@/lib/link-import";
import { fetchPublicPage } from "@/lib/safe-fetch";

/** Fills in thumbnails for saved apps that don't have one yet (up to 12 per call). "" marks "looked, none found". */
export const POST = route(async ({ user }) => {
  const todo = await db.appLink.findMany({ where: { userId: user.id, imageUrl: null }, select: { id: true, url: true }, take: 12 });
  const found = await Promise.all(
    todo.map(async (l) => {
      const image = await fetchPublicPage(l.url)
        .then((p) => findThumbnail(p.html, p.url))
        .catch(() => null);
      await db.appLink.update({ where: { id: l.id }, data: { imageUrl: image ?? "" } });
      return !!image;
    }),
  );
  const remaining = await db.appLink.count({ where: { userId: user.id, imageUrl: null } });
  return { checked: todo.length, found: found.filter(Boolean).length, remaining };
});
