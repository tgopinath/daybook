import { lookup } from "dns/promises";
import { isIP } from "net";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { extractAppCards } from "@/lib/link-import";

const MAX_BYTES = 2_000_000;

/** Rejects loopback, private, link-local and other non-public addresses so the import can't reach internal services. */
function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new ApiError(400, "Use an https:// link");
  if (url.port && url.port !== "443") throw new ApiError(400, "That link can't be imported");
  const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new ApiError(400, "Couldn't find that website");
  if (addrs.some((a) => isPrivate(a.address))) throw new ApiError(400, "That link can't be imported");
}

async function fetchPage(start: string) {
  let url = new URL(start);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "My Diary link import", accept: "text/html" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new ApiError(400, `That page answered with an error (${res.status})`);
    if (!(res.headers.get("content-type") ?? "").includes("html")) throw new ApiError(400, "That link isn't a web page");
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: url.toString() };
  }
  throw new ApiError(400, "That link redirects too many times");
}

/** Reads a projects/portfolio page and returns one app per project card, marking ones already saved. */
export const POST = route(async ({ req, user }) => {
  const { url } = await body(req, z.object({ url: z.string().trim().url("Paste a full link").max(500) }));
  const page = await fetchPage(url.replace(/^http:\/\//i, "https://")).catch((e) => {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "Couldn't open that page");
  });
  const saved = new Set((await db.appLink.findMany({ where: { userId: user.id }, select: { url: true } })).map((l) => l.url.replace(/\/+$/, "").toLowerCase()));
  const apps = extractAppCards(page.html, page.url).map((a) => ({ ...a, saved: saved.has(a.url.replace(/\/+$/, "").toLowerCase()) }));
  return { apps };
});
