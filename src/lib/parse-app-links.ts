// Parses pasted text into app links: one per line, as "Name - https://…", "Name https://…",
// "https://… Name", "Name | https://… | description" or just a link (name from the address).

export type ParsedLink = { name: string; url: string; description: string; error?: string };

const URL_RE = /https?:\/\/[^\s|,<>"']+/i;

function nameFromUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean).pop();
    const base = path && !/\.(html?|php)$/i.test(path) ? path : u.hostname.replace(/^www\./, "").split(".")[0]!;
    return decodeURIComponent(base)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 80);
  } catch {
    return "";
  }
}

export function parseAppLinks(text: string): ParsedLink[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(URL_RE);
      if (!m) return { name: line.slice(0, 80), url: "", description: "", error: "No link found on this line" };
      let url = m[0].replace(/[).,;]+$/, "");
      if (url.startsWith("http://")) url = "https://" + url.slice(7);
      const rest = (line.slice(0, m.index) + " " + line.slice((m.index ?? 0) + m[0].length))
        .split("|")
        .map((s) => s.replace(/^[\s\-–—:•*]+|[\s\-–—:]+$/g, "").trim())
        .filter(Boolean);
      const name = (rest[0] || nameFromUrl(url)).slice(0, 80);
      const description = rest.slice(1).join(" — ").slice(0, 240);
      return { name, url, description, ...(name ? {} : { error: "Add a name" }) };
    });
}
