// Journal helpers shared by the API, the journal UI and other modules (dashboard, weekly review).
// Pure functions only: safe to import on the server and in client components.

export const JOURNAL_PAGE_SIZE = 30;

export const EMPTY_JOURNAL_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** Plain text of a TipTap JSON document (blocks separated by newlines). */
export function extractText(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const o = n as { type?: string; text?: string; content?: unknown[] };
    if (typeof o.text === "string") out.push(o.text);
    if (o.type === "hardBreak") out.push("\n");
    if (Array.isArray(o.content)) {
      o.content.forEach(walk);
      if (o.type && o.type !== "text" && o.type !== "doc") out.push("\n");
    }
  };
  walk(node);
  return out.join("").replace(/\n{2,}/g, "\n").trim();
}

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return m ? m.length : 0;
}

/** Minutes to read at ~220 words per minute (at least 1 when there is any text). */
export function readingMinutes(words: number): number {
  return words ? Math.max(1, Math.round(words / 220)) : 0;
}

/** Short one-line preview. Private entries never expose their text. */
export function journalPreview(entry: { plainText: string; isPrivate: boolean }, max = 180): string | null {
  if (entry.isPrivate) return null;
  return entry.plainText.replace(/\s+/g, " ").trim().slice(0, max);
}

/** True when an entry has nothing worth keeping (discard instead of saving). */
export function isEmptyEntry(e: { title: string; plainText: string; mediaCount?: number; mood?: string | null; tagCount?: number }) {
  return !e.title.trim() && !e.plainText.trim() && !e.mediaCount && !e.mood && !e.tagCount;
}

/**
 * Text that may be shared with AI or summaries. Private entries are excluded entirely;
 * use this filter in any module that builds AI context from journal entries.
 */
export function aiSafeEntries<T extends { isPrivate: boolean; deletedAt?: unknown }>(entries: T[]): T[] {
  return entries.filter((e) => !e.isPrivate && !e.deletedAt);
}
