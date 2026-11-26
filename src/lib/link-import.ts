// Turns a web page (a portfolio, a projects page) into app links: one per project card.
// Pure parsing lives in extractAppCards (tested); fetching with SSRF guards in fetchPublicPage.

export type ImportedApp = { name: string; url: string; description: string };

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
  const push = (name: string, url: string | null, description: string) => {
    if (!url || !name) return;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key) || key === base.toString().replace(/\/+$/, "").toLowerCase()) return;
    seen.add(key);
    out.push({ name: name.slice(0, 80), url, description: clip(description, 240) });
  };

  for (const block of cardBlocks(body)) {
    const title = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const para = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const name = title ? decode(title[1]!) : "";
    push(name, bestLink(anchors(block, base)), para ? decode(para[1]!) : "");
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
