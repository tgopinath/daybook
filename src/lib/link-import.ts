// Turns a web page (a portfolio, a projects page) into app links: one per project card.
// Pure parsing lives in extractAppCards (tested); fetching with SSRF guards in fetchPublicPage.

export type ImportedApp = { name: string; url: string; description: string; image: string | null };

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** Shortens at a word boundary with an ellipsis. */
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

const SKIP_FILE = /\.(apk|aab|ipa|zip|dmg|exe|pdf|png|jpe?g|webp|gif|svg|mp4)(\?|#|$)/i;
const SKIP_HOST = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|schema\.org|w3\.org)$/i;
const OPEN_WORDS = /(open|live|visit|launch|try|play|demo|website|web app|view app|app\b)/i;

type Anchor = { href: string; text: string };

function anchors(html: string, base: URL): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = (m[2] ?? m[3] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript):/i.test(raw)) continue;
    try {
      const u = new URL(raw, base);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      u.protocol = "https:";
      if (SKIP_HOST.test(u.hostname) || SKIP_FILE.test(u.pathname)) continue;
      out.push({ href: u.toString(), text: decode(m[4] ?? "") });
    } catch {
      /* ignore bad hrefs */
    }
  }
  return out;
}

/** The link that best represents the project: an "Open the live app" style link, else a non-GitHub link, else its repo. */
function bestLink(list: Anchor[]): string | null {
  const notReleases = list.filter((a) => !/github\.com\/[^/]+\/[^/]+\/releases/i.test(a.href));
  const live = notReleases.find((a) => OPEN_WORDS.test(a.text) && !/github\.com/i.test(a.href));
  if (live) return live.href;
  const site = notReleases.find((a) => !/github\.com/i.test(a.href));
  if (site) return site.href;
  return notReleases[0]?.href ?? null;
}

function cardBlocks(html: string): string[] {
  const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1]!);
  if (articles.length >= 2) return articles;
  // Fallback: list items / elements marked as cards (non-nested good enough for most portfolio pages).
  const cards = [...html.matchAll(/<(li|div|section)\b[^>]*class\s*=\s*"[^"]*\b(card|project|work|item)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[3]!);
  return cards.length >= 2 ? cards : [];
}

export function extractAppCards(html: string, pageUrl: string, limit = 50): ImportedApp[] {
  const base = new URL(pageUrl);
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const seen = new Set<string>();
  const out: ImportedApp[] = [];
  const push = (name: string, url: string | null, description: string, image: string | null = null) => {
    if (!url || !name) return;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key) || key === base.toString().replace(/\/+$/, "").toLowerCase()) return;
    seen.add(key);
    out.push({ name: name.slice(0, 80), url, description: clip(description, 240), image });
  };

  for (const block of cardBlocks(body)) {
    const title = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const para = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const name = title ? decode(title[1]!) : "";
    push(name, bestLink(anchors(block, base)), para ? decode(para[1]!) : "", firstImage(block, base));
    if (out.length >= limit) return out;
  }
  if (out.length) return out;

  // No cards on the page: fall back to its outbound links with readable text.
  for (const a of anchors(body, base)) {
    if (new URL(a.href).hostname === base.hostname) continue;
    if (a.text.length < 3 || a.text.length > 80) continue;
    push(a.text, a.href, "");
    if (out.length >= limit) break;
  }
  return out;
}

function absHttps(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim().replace(/&amp;/g, "&"), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.protocol = "https:";
    const s = u.toString();
    return s.length <= 1000 ? s : null;
  } catch {
    return null;
  }
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((v) => v !== undefined);

/** The first real picture in a card (a screenshot or thumbnail), skipping tiny badges and data URIs. */
function firstImage(block: string, base: URL): string | null {
  for (const m of block.matchAll(/<img\b[^>]*>/gi)) {
    const w = Number(attr(m[0], "width") ?? 0);
    if (w && w < 64) continue;
    const src = attr(m[0], "src");
    if (!src || src.startsWith("data:")) continue;
    const u = absHttps(src, base);
    if (u) return u;
  }
  return null;
}

/** A page's best thumbnail: its share image (og/twitter), else its app icon, else its SVG/PNG favicon. */
export function findThumbnail(html: string, pageUrl: string): string | null {
  const base = new URL(pageUrl);
  const head = html.slice(0, 200_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  for (const key of ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const tag = metas.find((t) => (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase() === key);
    const u = absHttps(tag && attr(tag, "content"), base);
    if (u) return u;
  }
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const rel = (t: string) => (attr(t, "rel") ?? "").toLowerCase();
  const pick = links.find((t) => rel(t).includes("apple-touch-icon")) ?? links.find((t) => /(^|\s)icon(\s|$)/.test(rel(t)) && /\.(svg|png)(\?|$)/i.test(attr(t, "href") ?? ""));
  return absHttps(pick && attr(pick, "href"), base);
}
