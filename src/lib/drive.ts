// My Storage: shared types and pure helpers (used by both the API and the UI).

export type DriveFilter = "all" | "starred" | "recent" | "photos" | "videos" | "documents" | "trash";
export type DriveSort = "name" | "date" | "size" | "type";
export type SortDir = "asc" | "desc";

export const DRIVE_FILTERS: DriveFilter[] = ["all", "starred", "recent", "photos", "videos", "documents", "trash"];
export const DRIVE_SORTS: DriveSort[] = ["name", "date", "size", "type"];
export const RECENT_DAYS = 30;
export const PAGE_SIZE = 60;
export const MAX_FOLDER_DEPTH = 20;
export const NAME_MAX = 200;

/** Folder colours: CSS custom properties / tokens, never raw text colours. */
export const FOLDER_COLORS = [
  { value: "plum", label: "Plum", css: "var(--primary)" },
  { value: "blue", label: "Blue", css: "#3b82f6" },
  { value: "green", label: "Green", css: "#16a34a" },
  { value: "amber", label: "Amber", css: "#d97706" },
  { value: "rose", label: "Rose", css: "#e11d48" },
  { value: "slate", label: "Slate", css: "#64748b" },
] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number]["value"];
export const folderColorCss = (c: string | null | undefined) => FOLDER_COLORS.find((x) => x.value === c)?.css ?? "var(--text-3)";

export type DriveFolderDTO = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
};

export type DriveFileDTO = {
  id: string;
  name: string;
  folderId: string | null;
  starred: boolean;
  source: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  path?: string;
  media: {
    id: string;
    kind: "image" | "video" | "audio" | "document" | "file";
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    originalName: string | null;
    source: string;
    takenAt: string | null;
    status: string;
    createdAt: string;
    url: string;
  };
};

/** Media kinds that each filter shows. */
export function kindsForFilter(filter: DriveFilter): string[] | null {
  if (filter === "photos") return ["image"];
  if (filter === "videos") return ["video"];
  if (filter === "documents") return ["document", "file"];
  return null;
}

/** Trims a name, removes control characters and slashes; null when nothing is left. */
export function cleanName(raw: string): string | null {
  const v = raw.replace(/[\u0000-\u001f\u007f]+/g, "").replace(/[/\\]+/g, "-").trim().slice(0, NAME_MAX);
  return v && v !== "." && v !== ".." ? v : null;
}

/** Breadcrumb chain from the root to `id` (inclusive). Guards against cycles and missing parents. */
export function folderPath<T extends { id: string; parentId: string | null }>(folders: T[], id: string | null): T[] {
  if (!id) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: T[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id) && out.length <= MAX_FOLDER_DEPTH * 5) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** "Trips / 2026 / Goa" style path. */
export function folderPathLabel<T extends { id: string; parentId: string | null; name: string }>(folders: T[], id: string | null) {
  return folderPath(folders, id)
    .map((f) => f.name)
    .join(" / ");
}

/** All descendants of the given folders (not including them). */
export function descendantIds<T extends { id: string; parentId: string | null }>(folders: T[], rootIds: string[]): string[] {
  const children = new Map<string, string[]>();
  for (const f of folders) if (f.parentId) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
  const out: string[] = [];
  const seen = new Set(rootIds);
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of children.get(id) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      queue.push(c);
    }
  }
  return out;
}

/** True when moving `folderId` under `targetParentId` would put it inside itself. */
export function wouldCreateCycle<T extends { id: string; parentId: string | null }>(folders: T[], folderId: string, targetParentId: string | null) {
  if (!targetParentId) return false;
  if (targetParentId === folderId) return true;
  return descendantIds(folders, [folderId]).includes(targetParentId);
}

/** Depth of the subtree under a folder (1 = no children). */
export function subtreeDepth<T extends { id: string; parentId: string | null }>(folders: T[], folderId: string): number {
  const kids = folders.filter((f) => f.parentId === folderId);
  return 1 + (kids.length ? Math.max(...kids.map((k) => subtreeDepth(folders, k.id))) : 0);
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Short type label: "PDF", "Word", "Spreadsheet", "Image"… */
export function typeLabel(mimeType: string, kind: string) {
  const m = mimeType.toLowerCase();
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (m === "application/pdf") return "PDF";
  if (m.includes("wordprocessingml") || m === "application/msword" || m.includes("opendocument.text")) return "Document";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel" || m.includes("opendocument.spreadsheet")) return "Spreadsheet";
  if (m.includes("presentationml") || m === "application/vnd.ms-powerpoint" || m.includes("opendocument.presentation")) return "Presentation";
  if (m === "text/csv") return "CSV";
  if (m === "text/markdown") return "Markdown";
  if (m === "application/json") return "JSON";
  if (m === "text/plain") return "Text";
  if (m === "application/rtf") return "Rich text";
  if (m.includes("zip") && !m.includes("epub")) return "ZIP";
  if (m.includes("epub")) return "EPUB";
  return "File";
}

/** Text-like files previewed as plain text (never rendered as HTML). */
export const isTextPreviewable = (mimeType: string) => ["text/plain", "text/csv", "text/markdown", "application/json"].includes(mimeType.toLowerCase());

/** Viewer-capable kinds (MediaViewer handles them). */
export const isViewerKind = (kind: string) => kind === "image" || kind === "video" || kind === "audio" || kind === "document";

export const TEXT_PREVIEW_MAX = 1024 * 1024;
