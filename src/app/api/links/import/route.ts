import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { extractAppCards } from "@/lib/link-import";
import { fetchPublicPage } from "@/lib/safe-fetch";

/** Reads a projects/portfolio page and returns one app per project card, marking ones already saved. */
export const POST = route(async ({ req, user }) => {
  const { url } = await body(req, z.object({ url: z.string().trim().url("Paste a full link").max(500) }));
  const page = await fetchPublicPage(url.replace(/^http:\/\//i, "https://")).catch((e) => {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "Couldn't open that page");
  });
  const saved = new Set((await db.appLink.findMany({ where: { userId: user.id }, select: { url: true } })).map((l) => l.url.replace(/\/+$/, "").toLowerCase()));
  const apps = extractAppCards(page.html, page.url).map((a) => ({ ...a, saved: saved.has(a.url.replace(/\/+$/, "").toLowerCase()) }));
  return { apps };
});
