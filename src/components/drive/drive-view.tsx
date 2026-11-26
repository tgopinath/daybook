"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import {
  ArrowDownUp,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  FolderInput,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Palette,
  Pencil,
  RotateCcw,
  Search,
  Star,
  StarOff,
  Trash2,
  UploadCloud,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { EmptyState, PageHeader, Segmented, Skeleton, SkeletonList } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { MediaViewer } from "@/components/media/media";
import { api, refresh, SUMMARY_KEYS, useApi } from "@/lib/client";
import { uploadFile, type Media } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useCreateParam } from "@/lib/use-create-param";
import { folderPath, isViewerKind, type DriveFileDTO, type DriveFilter, type DriveFolderDTO, type DriveSort, type SortDir } from "@/lib/drive";
import { FolderTree, isFileDrag, useDropTarget, type DragPayload } from "./folder-tree";
import { FileTile, FolderTile, ListHeader, ListRow, entryName, type Entry, type EntryHandlers } from "./entries";
import { MoveDialog, NameDialog } from "./dialogs";
import { FileCardPreview, downloadUrl } from "./preview";
import { GoogleDriveImport } from "./google-drive-import";
import { UsageMeter } from "./usage-meter";
import { FolderIcon } from "./file-icon";

type ListResp = { items: DriveFileDTO[]; folders: (DriveFolderDTO & { path?: string })[]; nextCursor: string | null };
type Upload = { key: string; name: string; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };

const FILTERS: { value: DriveFilter; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All files", icon: HardDrive },
  { value: "starred", label: "Starred", icon: Star },
  { value: "recent", label: "Recent", icon: Clock },
  { value: "photos", label: "Photos", icon: ImageIcon },
  { value: "videos", label: "Videos", icon: Video },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "trash", label: "Trash", icon: Trash2 },
];
const SORTS: { value: DriveSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Date added" },
  { value: "size", label: "Size" },
  { value: "type", label: "Type" },
];
const UPLOAD_ACCEPT = [
  "image/*,video/mp4,video/quicktime,video/webm,audio/*,application/pdf",
  ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.md,.json,.rtf,.zip,.epub",
].join(",");
const MAX_BATCH = 100;
const CONCURRENCY = 3;

function useMediaQuery(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Browsers name markdown/CSV inconsistently; fill in a type from the extension when it's missing. */
function withType(file: File): File {
  if (file.type) return file;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = { md: "text/markdown", csv: "text/csv", json: "application/json", txt: "text/plain", epub: "application/epub+zip", heic: "image/heic", odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation", rtf: "application/rtf" };
  return map[ext] ? new File([file], file.name, { type: map[ext], lastModified: file.lastModified }) : file;
}

const toMedia = (f: DriveFileDTO): Media => ({ ...f.media, originalName: f.name });

export function DriveView() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DriveFilter>("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const [sort, setSort] = useState<DriveSort>("name");
  const [dir, setDir] = useState<SortDir>("asc");
  const [viewPref, setViewPref] = useState<"grid" | "list">("grid");
  const view = isMobile ? "list" : viewPref;
  const trash = filter === "trash";
  const browsing = filter === "all" && !q;

  // ---------------------------------------------------------------- data
  const { data: folderData, mutate: reloadFolders } = useApi<{ items: DriveFolderDTO[] }>("/api/drive/folders");
  const folders = useMemo(() => folderData?.items ?? [], [folderData]);
  const { data: trashFolderData, mutate: reloadTrashFolders } = useApi<{ items: DriveFolderDTO[] }>(trash ? "/api/drive/folders?scope=trash" : null);

  const base = useMemo(() => {
    const p = new URLSearchParams();
    if (browsing && folderId) p.set("folderId", folderId);
    if (filter !== "all") p.set("filter", filter);
    if (q) p.set("q", q);
    p.set("sort", sort);
    p.set("dir", dir);
    return `/api/drive/files?${p}`;
  }, [browsing, folderId, filter, q, sort, dir]);
  const { data: pages, size, setSize, isLoading, isValidating, mutate: reloadFiles, error } = useSWRInfinite<ListResp>(
    (i, prev: ListResp | null) => (i === 0 ? base : prev?.nextCursor ? `${base}&cursor=${prev.nextCursor}` : null),
    (u: string) => api.get<ListResp>(u),
    { revalidateFirstPage: true, revalidateOnFocus: true },
  );
  const hasMore = !!pages?.[pages.length - 1]?.nextCursor;
  const loadingMore = isValidating && !!pages && size > pages.length;

  const files = useMemo(() => pages?.flatMap((p) => p.items) ?? [], [pages]);
  const listedFolders = useMemo(() => {
    const raw = trash ? (trashFolderData?.items ?? []) : (pages?.[0]?.folders ?? []);
    const needle = q.toLowerCase();
    const list = trash && q ? raw.filter((f) => f.name.toLowerCase().includes(needle)) : [...raw];
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * (sort === "name" && dir === "desc" ? -1 : 1));
    return list;
  }, [pages, trash, trashFolderData, q, sort, dir]);
  const entries: Entry[] = useMemo(
    () => [...listedFolders.map((f) => ({ key: `d:${f.id}`, type: "folder" as const, folder: f })), ...files.map((f) => ({ key: `f:${f.id}`, type: "file" as const, file: f }))],
    [listedFolders, files],
  );

  const reloadAll = useCallback(() => {
    void reloadFiles();
    void reloadFolders();
    if (trash) void reloadTrashFolders();
    void refresh("/api/drive", ...SUMMARY_KEYS);
  }, [reloadFiles, reloadFolders, reloadTrashFolders, trash]);

  // An open folder that disappeared (deleted elsewhere) → back to the top level.
  useEffect(() => {
    if (folderId && folderData && !folders.some((f) => f.id === folderId)) setFolderId(null);
  }, [folderId, folderData, folders]);

  // ---------------------------------------------------------------- view prefs + deep links
  useEffect(() => {
    try {
      const v = localStorage.getItem("drive-view");
      if (v === "grid" || v === "list") setViewPref(v);
    } catch {
      /* private mode */
    }
  }, []);
  const changeView = (v: "grid" | "list") => {
    setViewPref(v);
    try {
      localStorage.setItem("drive-view", v);
    } catch {
      /* ignore */
    }
  };

  const [viewer, setViewer] = useState<{ files: DriveFileDTO[]; index: number } | null>(null);
  const [cardFile, setCardFile] = useState<DriveFileDTO | null>(null);

  const openFile = useCallback(
    (f: DriveFileDTO, list?: DriveFileDTO[]) => {
      if (isViewerKind(f.media.kind)) {
        const pool = (list ?? files).filter((x) => isViewerKind(x.media.kind));
        const idx = pool.findIndex((x) => x.id === f.id);
        setViewer(idx >= 0 ? { files: pool, index: idx } : { files: [f], index: 0 });
      } else setCardFile(f);
    },
    [files],
  );

  // /drive?folder=<id> and /drive?file=<id> (in-app links copied with "Copy link").
  useEffect(() => {
    const url = new URL(window.location.href);
    const folder = url.searchParams.get("folder");
    const fileId = url.searchParams.get("file");
    if (!folder && !fileId) return;
    url.searchParams.delete("folder");
    url.searchParams.delete("file");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (folder) setFolderId(folder);
    if (fileId)
      api
        .get<{ file: DriveFileDTO }>(`/api/drive/files/${encodeURIComponent(fileId)}`)
        .then(({ file }) => {
          if (file.deletedAt) setFilter("trash");
          else setFolderId(file.folderId);
          openFile(file, [file]);
        })
        .catch(toastError);
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- navigation
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const buttons = useRef(new Map<number, HTMLButtonElement>());

  const goFolder = useCallback((id: string | null) => {
    setFilter("all");
    setSearch("");
    setFolderId(id);
  }, []);
  const goFilter = (f: DriveFilter) => {
    setFilter(f);
    setSearch("");
    if (f === "recent") {
      setSort("date");
      setDir("desc");
    }
  };
  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
    setFocus(0);
  }, [folderId, filter, q]);

  const crumbs = useMemo(() => folderPath(folders, folderId), [folders, folderId]);

  // ---------------------------------------------------------------- selection helpers
  const selectedEntries = useMemo(() => entries.filter((e) => selected.has(e.key)), [entries, selected]);
  const idsOf = (list: Entry[]) => ({
    fileIds: list.filter((e) => e.type === "file").map((e) => (e as Extract<Entry, { type: "file" }>).file.id),
    folderIds: list.filter((e) => e.type === "folder").map((e) => (e as Extract<Entry, { type: "folder" }>).folder.id),
  });
  const clearSelection = () => {
    setSelected(new Set());
    setAnchor(null);
  };
  const toggle = (index: number, shift: boolean) => {
    const e = entries[index];
    if (!e) return;
    setSelected((s) => {
      const n = new Set(s);
      if (shift && anchor !== null) {
        const [a, b] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = a; i <= b; i++) n.add(entries[i]!.key);
      } else if (n.has(e.key)) n.delete(e.key);
      else n.add(e.key);
      return n;
    });
    if (!shift) setAnchor(index);
  };

  // ---------------------------------------------------------------- uploads
  const [uploads, setUploads] = useState<Upload[]>([]);
  const uploadMany = useCallback(
    async (list: File[], target: string | null) => {
      if (trash) {
        toast.info("Open a folder (not the trash) to upload files");
        return;
      }
      const picked = list.slice(0, MAX_BATCH).map(withType);
      if (list.length > MAX_BATCH) toast.info(`Uploading the first ${MAX_BATCH} files — add the rest in another batch`);
      if (!picked.length) return;
      const jobs = picked.map((file) => ({ file, key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}` }));
      setUploads((u) => [...u.filter((x) => x.status !== "done"), ...jobs.map((j) => ({ key: j.key, name: j.file.name, progress: 0, status: "queued" as const }))]);
      const patch = (key: string, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
      let ok = 0;
      let next = 0;
      const worker = async () => {
        while (next < jobs.length) {
          const job = jobs[next++]!;
          patch(job.key, { status: "uploading" });
          try {
            const media = await uploadFile(job.file, { onProgress: (progress) => patch(job.key, { progress }) });
            await api.post("/api/drive/files", { mediaId: media.id, name: job.file.name, folderId: target });
            patch(job.key, { status: "done", progress: 1 });
            ok++;
            void reloadFiles();
          } catch (err) {
            patch(job.key, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
      reloadAll();
      const failed = jobs.length - ok;
      if (ok) toast.success(`${ok === 1 ? "1 file" : `${ok} files`} uploaded${target && target !== folderId ? ` to ${folders.find((f) => f.id === target)?.name ?? "the folder"}` : ""}`);
      if (failed) toast.error(`${failed === 1 ? "1 file" : `${failed} files`} couldn't be uploaded`);
      setTimeout(() => setUploads((u) => u.filter((x) => x.status !== "done")), 2500);
    },
    [trash, reloadFiles, reloadAll, folderId, folders],
  );
  const uploadTarget = browsing ? folderId : null;
  const fileInput = useRef<HTMLInputElement>(null);
  const pickFiles = () => fileInput.current?.click();
  // /drive?upload=1 (the "New" menu): open the file picker. Browsers only allow that during a click, so after
  // a page load we offer a one-tap "Choose files" instead; when the menu is used on this page, it opens straight away.
  useCreateParam("upload", () => {
    if (navigator.userActivation?.isActive) pickFiles();
    else toast.info("Pick the files you'd like to upload.", { action: { label: "Choose files", onClick: pickFiles }, duration: 10000 });
  });

  // Dropping files anywhere on the page uploads into the open folder.
  const [pageDrag, setPageDrag] = useState(false);
  const dragDepth = useRef(0);
  const pageDropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFileDrag(e) || trash) return;
      dragDepth.current++;
      setPageDrag(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setPageDrag(false);
    },
    onDragOver: (e: React.DragEvent) => {
      if (isFileDrag(e) && !trash) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      dragDepth.current = 0;
      setPageDrag(false);
      if (!isFileDrag(e) || trash) return;
      e.preventDefault();
      void uploadMany(Array.from(e.dataTransfer.files), uploadTarget);
    },
  };
  // A drop handled by a folder target stops propagation, so the page counter must be reset too.
  useEffect(() => {
    const end = () => {
      dragDepth.current = 0;
      setPageDrag(false);
    };
    window.addEventListener("drop", end);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("drop", end);
      window.removeEventListener("dragend", end);
    };
  }, []);

  // ---------------------------------------------------------------- actions
  const bulk = useCallback((action: string, ids: { fileIds: string[]; folderIds: string[] }, folder?: string | null) => api.post<Record<string, number>>("/api/drive/bulk", { action, ...ids, folderId: folder }), []);

  const trashItems = async (list: Entry[]) => {
    const ids = idsOf(list);
    if (!ids.fileIds.length && !ids.folderIds.length) return;
    try {
      await bulk("trash", ids);
      clearSelection();
      setViewer(null);
      reloadAll();
      toast.undo(list.length === 1 ? `“${entryName(list[0]!)}” moved to trash` : `${list.length} items moved to trash`, async () => {
        try {
          await bulk("restore", ids);
          reloadAll();
        } catch (err) {
          toastError(err);
        }
      });
    } catch (err) {
      toastError(err);
    }
  };
  const restoreItems = async (list: Entry[]) => {
    try {
      await bulk("restore", idsOf(list));
      clearSelection();
      reloadAll();
      toast.success(list.length === 1 ? `“${entryName(list[0]!)}” restored` : `${list.length} items restored`);
    } catch (err) {
      toastError(err);
    }
  };
  const deleteForever = async (list: Entry[]) => {
    const folderCount = list.filter((e) => e.type === "folder").length;
    const ok = await confirm({
      title: list.length === 1 ? `Delete “${entryName(list[0]!)}” forever?` : `Delete ${list.length} items forever?`,
      body: `${folderCount ? "Folders are deleted with everything inside them. " : ""}This can't be undone. Files used elsewhere in My Diary (journal, memories…) stay there.`,
      destructive: true,
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    try {
      await bulk("delete", idsOf(list));
      clearSelection();
      reloadAll();
      toast.success("Deleted forever");
    } catch (err) {
      toastError(err);
    }
  };
  const emptyTrash = async () => {
    const ok = await confirm({ title: "Empty the trash?", body: "Everything in the trash is deleted forever. This can't be undone.", destructive: true, confirmLabel: "Empty trash" });
    if (!ok) return;
    try {
      const fileIds: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 100; i++) {
        const r: ListResp = await api.get<ListResp>(`/api/drive/files?scope=trash&limit=200${cursor ? `&cursor=${cursor}` : ""}`);
        fileIds.push(...r.items.map((f) => f.id));
        cursor = r.nextCursor;
        if (!cursor) break;
      }
      const folderIds = (await api.get<{ items: DriveFolderDTO[] }>("/api/drive/folders?scope=trash")).items.map((f) => f.id);
      for (let i = 0; i < Math.max(fileIds.length, folderIds.length); i += 500) await bulk("delete", { fileIds: fileIds.slice(i, i + 500), folderIds: folderIds.slice(i, i + 500) });
      reloadAll();
      toast.success("Trash emptied");
    } catch (err) {
      toastError(err);
    }
  };
  const moveItems = async (ids: DragPayload, target: string | null) => {
    // Dropping a folder onto itself is a no-op, not an error.
    const clean = { fileIds: ids.fileIds, folderIds: ids.folderIds.filter((id) => id !== target) };
    if (!clean.fileIds.length && !clean.folderIds.length) return;
    try {
      await bulk("move", clean, target);
      clearSelection();
      reloadAll();
      const n = clean.fileIds.length + clean.folderIds.length;
      toast.success(`Moved ${n === 1 ? "1 item" : `${n} items`} to ${target ? (folders.find((f) => f.id === target)?.name ?? "the folder") : "My Storage"}`);
    } catch (err) {
      toastError(err);
      throw err;
    }
  };
  const starFiles = async (fileIds: string[], on: boolean) => {
    if (!fileIds.length) return;
    try {
      await bulk(on ? "star" : "unstar", { fileIds, folderIds: [] });
      reloadAll();
      toast.success(on ? (fileIds.length === 1 ? "Starred" : `${fileIds.length} files starred`) : "Removed from starred");
    } catch (err) {
      toastError(err);
    }
  };
  const downloadFiles = (list: DriveFileDTO[]) => {
    list.forEach((f, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = downloadUrl(f);
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400),
    );
    if (list.length > 1) toast.info(`Downloading ${list.length} files — your browser may ask to allow multiple downloads`);
  };
  const copyLink = async (e: Entry) => {
    const url = `${window.location.origin}/drive?${e.type === "folder" ? `folder=${e.folder.id}` : `file=${e.file.id}`}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — it only works for you, signed in to My Diary");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  // ---------------------------------------------------------------- dialogs
  const [nameDlg, setNameDlg] = useState<
    { mode: "new-folder"; parentId: string | null } | { mode: "rename-folder" | "color-folder"; folder: DriveFolderDTO } | { mode: "rename-file"; file: DriveFileDTO } | null
  >(null);
  const [moveDlg, setMoveDlg] = useState<{ entries: Entry[] } | null>(null);
  const [sheet, setSheet] = useState<Entry | null>(null);

  const submitName = async (name: string, color: string | null) => {
    if (!nameDlg) return;
    try {
      if (nameDlg.mode === "new-folder") {
        await api.post("/api/drive/folders", { name, parentId: nameDlg.parentId, color });
        toast.success(`Folder “${name}” created`);
      } else if ("folder" in nameDlg) {
        await api.patch(`/api/drive/folders/${nameDlg.folder.id}`, { name, color });
      } else {
        await api.patch(`/api/drive/files/${nameDlg.file.id}`, { name });
      }
      reloadAll();
    } catch (err) {
      toastError(err);
      throw err;
    }
  };
  const rename = (e: Entry) => setNameDlg(e.type === "folder" ? { mode: "rename-folder", folder: e.folder } : { mode: "rename-file", file: e.file });

  const openEntry = (e: Entry) => {
    if (e.type === "folder") {
      if (trash) return setSheet(e);
      goFolder(e.folder.id);
    } else openFile(e.file);
  };

  const menuItems = (e: Entry): MenuItem[] => {
    if (trash)
      return [
        { label: "Restore", icon: RotateCcw, onSelect: () => void restoreItems([e]) },
        { type: "separator" },
        { label: "Delete forever", icon: Trash2, danger: true, onSelect: () => void deleteForever([e]) },
      ];
    const common: MenuItem[] = [
      { label: "Rename", icon: Pencil, onSelect: () => rename(e), shortcut: "F2" },
      { label: "Move to…", icon: FolderInput, onSelect: () => setMoveDlg({ entries: [e] }) },
      { label: "Copy link", icon: Copy, onSelect: () => void copyLink(e) },
    ];
    if (e.type === "folder")
      return [
        { label: "Open", icon: ChevronRight, onSelect: () => goFolder(e.folder.id) },
        { label: "New folder inside", icon: FolderPlus, onSelect: () => setNameDlg({ mode: "new-folder", parentId: e.folder.id }) },
        { label: "Colour", icon: Palette, onSelect: () => setNameDlg({ mode: "color-folder", folder: e.folder }) },
        ...common,
        { type: "separator" },
        { label: "Move to trash", icon: Trash2, danger: true, onSelect: () => void trashItems([e]), shortcut: "Del" },
      ];
    return [
      { label: "Preview", icon: FileText, onSelect: () => openFile(e.file) },
      { label: "Download", icon: Download, onSelect: () => downloadFiles([e.file]) },
      { label: e.file.starred ? "Remove star" : "Star", icon: e.file.starred ? StarOff : Star, onSelect: () => void starFiles([e.file.id], !e.file.starred) },
      ...common,
      { type: "separator" },
      { label: "Move to trash", icon: Trash2, danger: true, onSelect: () => void trashItems([e]), shortcut: "Del" },
    ];
  };

  // ---------------------------------------------------------------- keyboard
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = () => {
    if (view === "list") return 1;
    const el = gridRef.current?.querySelector<HTMLElement>("[data-grid='files']");
    if (!el) return 1;
    return Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
  };
  const focusAt = (i: number) => {
    const n = Math.max(0, Math.min(entries.length - 1, i));
    setFocus(n);
    buttons.current.get(n)?.focus();
    return n;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!entries.length || (e.target as HTMLElement).closest("input,textarea,[role=menu]")) return;
    const cur = Math.min(focus, entries.length - 1);
    const folderCount = listedFolders.length;
    const inFiles = cur >= folderCount;
    // Folders and files are separate grids on desktop; arrows move within the visual layout.
    const step = (dir: 1 | -1, vertical: boolean) => {
      if (!vertical || view === "list") return cur + dir;
      if (!inFiles) return cur + dir; // folder tiles: treat as one row-flow
      return cur + dir * columns();
    };
    let next: number | null = null;
    if (e.key === "ArrowDown") next = step(1, true);
    else if (e.key === "ArrowUp") next = step(-1, true);
    else if (e.key === "ArrowRight" && view === "grid") next = step(1, false);
    else if (e.key === "ArrowLeft" && view === "grid") next = step(-1, false);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = entries.length - 1;
    if (next !== null) {
      e.preventDefault();
      const n = focusAt(next);
      if (e.shiftKey) {
        const a = anchor ?? cur;
        const [lo, hi] = a < n ? [a, n] : [n, a];
        setSelected(new Set(entries.slice(lo, hi + 1).map((x) => x.key)));
        setAnchor(a);
      }
      return;
    }
    const target = selectedEntries.length ? selectedEntries : entries[cur] ? [entries[cur]!] : [];
    if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      if (trash) void deleteForever(target);
      else void trashItems(target);
    } else if (e.key === "F2" && !trash) {
      e.preventDefault();
      const t = selectedEntries.length === 1 ? selectedEntries[0]! : entries[cur];
      if (t) rename(t);
    } else if (e.key === " ") {
      e.preventDefault();
      toggle(cur, e.shiftKey);
    } else if (e.key === "Escape" && selected.size) {
      e.preventDefault();
      clearSelection();
    } else if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setSelected(new Set(entries.map((x) => x.key)));
    }
  };

  const handlers: EntryHandlers = {
    onActivate: (index, ev) => {
      const entry = entries[index];
      if (!entry) return;
      setFocus(index);
      if (ev.shiftKey) return toggle(index, true);
      if (ev.metaKey || ev.ctrlKey || selected.size > 0) return toggle(index, false);
      openEntry(entry);
    },
    onToggle: toggle,
    onLongPress: (index) => toggle(index, false),
    onFocusIndex: setFocus,
    menuItems,
    onOpenSheet: isMobile ? setSheet : undefined,
    dragPayload: (index) => {
      const e = entries[index];
      if (!e) return null;
      return selected.has(e.key) ? idsOf(selectedEntries) : idsOf([e]);
    },
    onMoveInto: (target, p) => void moveItems(p, target).catch(() => {}),
    onUploadInto: (target, list) => void uploadMany(list, target),
    onStar: (f) => void starFiles([f.id], !f.starred),
    registerButton: (index, el) => {
      if (el) buttons.current.set(index, el);
      else buttons.current.delete(index);
    },
  };

  // Infinite scroll: load the next page when the sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && !loadingMore && void setSize((s) => s + 1), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, setSize]);

  // ---------------------------------------------------------------- render
  const title = q ? `Results for “${q}”` : filter !== "all" ? FILTERS.find((f) => f.value === filter)!.label : (crumbs[crumbs.length - 1]?.name ?? "All files");
  const loading = isLoading && !pages;
  const showPath = !browsing;
  const selFiles = selectedEntries.filter((e): e is Extract<Entry, { type: "file" }> => e.type === "file").map((e) => e.file);
  const viewerFiles = viewer?.files ?? [];

  const itemProps = (entry: Entry, index: number) => ({
    entry,
    index,
    selected: selected.has(entry.key),
    selecting: selected.size > 0,
    focused: index === Math.min(focus, entries.length - 1),
    showPath,
    trash,
    h: handlers,
  });

  return (
    <div className="mx-auto w-full max-w-7xl" {...pageDropProps}>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={UPLOAD_ACCEPT}
        onChange={(e) => {
          if (e.target.files?.length) void uploadMany(Array.from(e.target.files), uploadTarget);
          e.target.value = "";
        }}
      />
      <PageHeader
        title="My Storage"
        description="Your private drive — only you can see what's here."
        actions={
          <>
            <Button onClick={pickFiles} disabled={trash}>
              <UploadCloud className="h-4 w-4" /> Upload
            </Button>
            <Button variant="outline" onClick={() => setNameDlg({ mode: "new-folder", parentId: uploadTarget })} disabled={trash}>
              <FolderPlus className="h-4 w-4" /> <span className="hidden sm:inline">New folder</span>
              <span className="sm:hidden">Folder</span>
            </Button>
            <GoogleDriveImport folderId={uploadTarget} onImported={reloadAll} compact={isMobile} />
          </>
        }
      />

      <div className="flex gap-6">
        {/* Desktop sidebar: filters, folder tree, storage meter */}
        <aside className="hidden w-60 shrink-0 lg:block" aria-label="My Storage navigation">
          <div className="sticky top-4 space-y-5">
            <FolderTree folders={folders} currentId={folderId} active={browsing} onOpen={goFolder} onMoveInto={(t, p) => void moveItems(p, t).catch(() => {})} onUploadInto={(t, l) => void uploadMany(l, t)} />
            <nav aria-label="Filters" className="space-y-0.5 border-t border-line pt-4">
              {FILTERS.slice(1).map((f) => (
                <FilterLink key={f.value} f={f} active={filter === f.value} onClick={() => goFilter(f.value)} onDropItems={f.value === "trash" ? (p) => void trashItems(entries.filter((e) => p.fileIds.includes((e as { file?: { id: string } }).file?.id ?? "") || p.folderIds.includes((e as { folder?: { id: string } }).folder?.id ?? ""))) : undefined} />
              ))}
            </nav>
            <div className="border-t border-line pt-4">
              <UsageMeter />
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1" aria-label={title}>
          {/* Mobile / tablet filters */}
          <div className="-mx-1 mb-3 lg:hidden">
            <Segmented value={filter} onChange={goFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, icon: f.icon }))} className="max-w-full" />
          </div>

          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={trash ? "Search the trash" : "Search files and folders"}
                aria-label="Search files and folders by name"
                className="h-10 pl-9 md:h-9"
              />
            </div>
            <Menu
              align="end"
              items={[
                { type: "label", label: "Sort by" },
                ...SORTS.map((s) => ({ label: s.label, icon: sort === s.value ? Check : undefined, onSelect: () => setSort(s.value) })),
                { type: "separator" },
                { label: "Ascending", icon: dir === "asc" ? Check : undefined, onSelect: () => setDir("asc") },
                { label: "Descending", icon: dir === "desc" ? Check : undefined, onSelect: () => setDir("desc") },
              ]}
              trigger={
                <Button variant="outline" className="h-10 md:h-9" aria-label={`Sort: ${SORTS.find((s) => s.value === sort)!.label}, ${dir === "asc" ? "ascending" : "descending"}`}>
                  <ArrowDownUp className="h-4 w-4" />
                  <span className="hidden sm:inline">{SORTS.find((s) => s.value === sort)!.label}</span>
                </Button>
              }
            />
            <div className="hidden md:block">
              <Segmented
                value={viewPref}
                onChange={changeView}
                options={[
                  { value: "grid", label: "Grid", icon: LayoutGrid },
                  { value: "list", label: "List", icon: List },
                ]}
              />
            </div>
            {trash && (entries.length > 0) && (
              <Button variant="ghost" onClick={() => void emptyTrash()} className="h-10 text-danger md:h-9">
                Empty trash
              </Button>
            )}
          </div>

          {/* Breadcrumbs / location */}
          <div className="mb-3 flex min-h-8 items-center gap-1 overflow-x-auto text-[14px] scroll-thin" aria-label="Location">
            {browsing ? (
              <nav aria-label="Breadcrumb">
                <ol className="flex items-center gap-1">
                  <Crumb label="My Storage" current={!crumbs.length} onClick={() => goFolder(null)} onDropItems={(p) => void moveItems(p, null).catch(() => {})} onDropFiles={(l) => void uploadMany(l, null)} />
                  {crumbs.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-1">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
                      <Crumb asItem={false} label={c.name} current={i === crumbs.length - 1} onClick={() => goFolder(c.id)} onDropItems={(p) => void moveItems(p, c.id).catch(() => {})} onDropFiles={(l) => void uploadMany(l, c.id)} />
                    </li>
                  ))}
                </ol>
              </nav>
            ) : (
              <h2 className="font-display text-[17px] font-semibold text-fg">{title}</h2>
            )}
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-1 rounded-[12px] border border-line bg-surface p-1.5 shadow-pop" role="toolbar" aria-label="Selected items">
              <Button variant="ghost" size="icon" onClick={clearSelection} aria-label="Clear selection">
                <X className="h-4 w-4" />
              </Button>
              <span className="mr-auto px-1 text-[14px] font-medium text-fg" aria-live="polite">
                {selected.size} selected
              </span>
              {trash ? (
                <>
                  <Button variant="ghost" onClick={() => void restoreItems(selectedEntries)}>
                    <RotateCcw className="h-4 w-4" /> Restore
                  </Button>
                  <Button variant="ghost" className="text-danger" onClick={() => void deleteForever(selectedEntries)}>
                    <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete forever</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setMoveDlg({ entries: selectedEntries })} aria-label="Move selected">
                    <FolderInput className="h-4 w-4" /> <span className="hidden sm:inline">Move</span>
                  </Button>
                  <Button variant="ghost" disabled={!selFiles.length} onClick={() => void starFiles(selFiles.map((f) => f.id), !selFiles.every((f) => f.starred))} aria-label={selFiles.length && selFiles.every((f) => f.starred) ? "Remove star from selected" : "Star selected"}>
                    {selFiles.length && selFiles.every((f) => f.starred) ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />} <span className="hidden sm:inline">Star</span>
                  </Button>
                  <Button variant="ghost" disabled={!selFiles.length} onClick={() => downloadFiles(selFiles)} aria-label="Download selected">
                    <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button variant="ghost" className="text-danger" onClick={() => void trashItems(selectedEntries)} aria-label="Move selected to trash">
                    <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Upload progress */}
          {uploads.length > 0 && (
            <div className="mb-3 rounded-[12px] border border-line bg-surface p-3" aria-live="polite">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[14px] font-medium text-fg">
                  {uploads.some((u) => u.status === "uploading" || u.status === "queued") ? `Uploading ${uploads.filter((u) => u.status === "done").length} of ${uploads.length}…` : "Uploads"}
                </span>
                {!uploads.some((u) => u.status === "uploading" || u.status === "queued") && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setUploads([])} aria-label="Dismiss uploads">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto scroll-thin">
                {uploads.map((u) => (
                  <li key={u.key} className="flex items-center gap-2 text-[12.5px]">
                    {u.status === "done" ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : u.status === "error" ? <X className="h-3.5 w-3.5 shrink-0 text-danger" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
                    <span className="min-w-0 flex-1 truncate text-fg">{u.name}</span>
                    {u.status === "error" ? <span className="max-w-[55%] truncate text-danger" title={u.error}>{u.error}</span> : <span className="text-fg-2 tabular-nums">{u.status === "queued" ? "Waiting" : `${Math.round(u.progress * 100)}%`}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Content */}
          <div ref={gridRef} onKeyDown={onKeyDown} className={cn("relative rounded-[14px] transition-colors", pageDrag && "ring-2 ring-primary ring-offset-2")}>
            {pageDrag && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-primary-soft">
                <p className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-[14px] font-medium text-fg shadow-pop">
                  <UploadCloud className="h-4 w-4 text-primary" /> Drop to upload to {crumbs[crumbs.length - 1]?.name && browsing ? `“${crumbs[crumbs.length - 1]!.name}”` : "My Storage"}
                </p>
              </div>
            )}
            {error && !pages ? (
              <EmptyState icon={HardDrive} title="Couldn't load your files" description={error instanceof Error ? error.message : "Please try again."} action={<Button onClick={() => void reloadFiles()}>Try again</Button>} />
            ) : loading ? (
              view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-busy="true" aria-label="Loading">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/5] w-full rounded-[12px]" />
                  ))}
                </div>
              ) : (
                <SkeletonList rows={8} />
              )
            ) : !entries.length ? (
              <Empty filter={filter} q={q} inFolder={!!folderId} onUpload={pickFiles} onNewFolder={() => setNameDlg({ mode: "new-folder", parentId: uploadTarget })} onShowAll={() => goFilter("all")} />
            ) : view === "list" ? (
              <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
                <ListHeader
                  sort={sort}
                  dir={dir}
                  showPath={showPath}
                  trash={trash}
                  onSort={(s) => {
                    if (s === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
                    else {
                      setSort(s);
                      setDir(s === "date" || s === "size" ? "desc" : "asc");
                    }
                  }}
                />
                <ul aria-label={`${title}: ${entries.length}${hasMore ? "+" : ""} items`}>
                  {entries.map((e, i) => (
                    <ListRow key={e.key} {...itemProps(e, i)} />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-5">
                {listedFolders.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[12px] font-medium tracking-wide text-fg-2 uppercase">Folders</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" role="list" aria-label="Folders">
                      {entries.slice(0, listedFolders.length).map((e, i) => (
                        <div role="listitem" key={e.key}>
                          <FolderTile {...itemProps(e, i)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {files.length > 0 && (
                  <div>
                    {listedFolders.length > 0 && <h3 className="mb-2 text-[12px] font-medium tracking-wide text-fg-2 uppercase">Files</h3>}
                    <div data-grid="files" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" role="list" aria-label="Files">
                      {entries.slice(listedFolders.length).map((e, j) => (
                        <div role="listitem" key={e.key}>
                          <FileTile {...itemProps(e, listedFolders.length + j)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {hasMore && (
              <div ref={sentinel} className="flex justify-center py-4">
                <Button variant="outline" loading={loadingMore} onClick={() => void setSize(size + 1)}>
                  Load more
                </Button>
              </div>
            )}
          </div>

          {!isMobile && entries.length > 0 && (
            <p className="mt-3 hidden text-[12px] text-fg-3 lg:block">
              Tip: drag files onto a folder to move them · arrows to move · Enter opens · Delete moves to trash · F2 renames · Shift/⌘-click selects several
            </p>
          )}

          <div className="mt-6 rounded-[14px] border border-line bg-surface p-4 lg:hidden">
            <UsageMeter />
          </div>
        </section>
      </div>

      {/* Dialogs */}
      <NameDialog
        open={!!nameDlg}
        onOpenChange={(o) => !o && setNameDlg(null)}
        title={nameDlg?.mode === "new-folder" ? "New folder" : nameDlg?.mode === "color-folder" ? "Folder colour" : nameDlg?.mode === "rename-file" ? "Rename file" : "Rename folder"}
        label={nameDlg?.mode === "rename-file" ? "File name" : "Folder name"}
        initialName={!nameDlg || nameDlg.mode === "new-folder" ? "" : nameDlg.mode === "rename-file" ? nameDlg.file.name : nameDlg.folder.name}
        initialColor={!nameDlg || nameDlg.mode === "new-folder" || nameDlg.mode === "rename-file" ? null : nameDlg.folder.color}
        withColor={nameDlg?.mode !== "rename-file"}
        submitLabel={nameDlg?.mode === "new-folder" ? "Create" : "Save"}
        onSubmit={submitName}
      />
      <MoveDialog
        open={!!moveDlg}
        onOpenChange={(o) => !o && setMoveDlg(null)}
        folders={folders}
        movingFolderIds={moveDlg ? idsOf(moveDlg.entries).folderIds : []}
        currentFolderId={folderId}
        count={moveDlg?.entries.length ?? 0}
        onMove={(t) => moveItems(idsOf(moveDlg?.entries ?? []), t)}
      />
      <ActionSheet entry={sheet} onClose={() => setSheet(null)} items={sheet ? menuItems(sheet) : []} />
      <MediaViewer
        items={viewerFiles.map(toMedia)}
        index={viewer?.index ?? null}
        onIndexChange={(i) => setViewer((v) => (v && i !== null ? { ...v, index: i } : null))}
        onDelete={trash ? undefined : (m) => {
          const f = viewerFiles.find((x) => x.media.id === m.id);
          if (f) void trashItems([{ key: `f:${f.id}`, type: "file", file: f }]);
        }}
        caption={(m) => m.originalName}
      />
      <FileCardPreview file={cardFile} onOpenChange={(o) => !o && setCardFile(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ small pieces

function FilterLink({ f, active, onClick, onDropItems }: { f: (typeof FILTERS)[number]; active: boolean; onClick: () => void; onDropItems?: (p: DragPayload) => void }) {
  const drop = useDropTarget(
    (p) => onDropItems?.(p),
    () => {},
  );
  const Icon = f.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      {...(onDropItems ? drop.props : {})}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[14px] transition-colors",
        active ? "bg-primary-soft font-medium text-primary" : "text-fg hover:bg-surface-2",
        onDropItems && drop.over && "ring-2 ring-danger",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {f.label}
    </button>
  );
}

function Crumb({ label, current, onClick, onDropItems, onDropFiles, asItem = true }: { label: string; current: boolean; onClick: () => void; onDropItems: (p: DragPayload) => void; onDropFiles: (f: File[]) => void; asItem?: boolean }) {
  const drop = useDropTarget(onDropItems, onDropFiles);
  const btn = (
    <button
      type="button"
      onClick={onClick}
      {...drop.props}
      aria-current={current ? "page" : undefined}
      className={cn("max-w-[220px] truncate rounded-md px-1.5 py-1 whitespace-nowrap", current ? "font-display text-[17px] font-semibold text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg", drop.over && "ring-2 ring-primary")}
    >
      {label}
    </button>
  );
  return asItem ? <li className="flex items-center">{btn}</li> : btn;
}

function ActionSheet({ entry, onClose, items }: { entry: Entry | null; onClose: () => void; items: MenuItem[] }) {
  return (
    <Dialog
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title={
        entry ? (
          <span className="flex items-center gap-2">
            {entry.type === "folder" && <FolderIcon color={entry.folder.color} className="h-4 w-4 shrink-0" />}
            <span className="break-all">{entryName(entry)}</span>
          </span>
        ) : (
          ""
        )
      }
      size="sm"
    >
      <ul className="-mx-2 -my-1">
        {items.map((it, i) =>
          it.type === "separator" ? (
            <li key={i} className="my-1 h-px bg-line" aria-hidden />
          ) : it.type === "label" ? null : (
            <li key={i}>
              <button
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  onClose();
                  // Let the sheet close before opening another dialog.
                  setTimeout(it.onSelect, 120);
                }}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-50", it.danger ? "text-danger" : "text-fg")}
              >
                {it.icon && <it.icon className="h-5 w-5 shrink-0" aria-hidden />}
                {it.label}
              </button>
            </li>
          ),
        )}
      </ul>
    </Dialog>
  );
}

function Empty({ filter, q, inFolder, onUpload, onNewFolder, onShowAll }: { filter: DriveFilter; q: string; inFolder: boolean; onUpload: () => void; onNewFolder: () => void; onShowAll: () => void }) {
  if (q) return <EmptyState icon={Search} title={`Nothing matches “${q}”`} description="Try another word — search looks at file names and folder names." />;
  if (filter === "trash") return <EmptyState icon={Trash2} title="Trash is empty" description="Deleted files and folders wait here until you restore them or delete them for good." />;
  if (filter === "starred") return <EmptyState icon={Star} title="No starred files yet" description="Star the files you reach for often and they'll gather here." action={<Button variant="outline" onClick={onShowAll}>Browse all files</Button>} />;
  if (filter === "recent") return <EmptyState icon={Clock} title="Nothing added in the last 30 days" action={<Button onClick={onUpload}><UploadCloud className="h-4 w-4" /> Upload files</Button>} />;
  if (filter === "photos") return <EmptyState icon={ImageIcon} title="No photos here yet" action={<Button onClick={onUpload}><UploadCloud className="h-4 w-4" /> Upload photos</Button>} />;
  if (filter === "videos") return <EmptyState icon={Video} title="No videos here yet" action={<Button onClick={onUpload}><UploadCloud className="h-4 w-4" /> Upload videos</Button>} />;
  if (filter === "documents") return <EmptyState icon={FileText} title="No documents here yet" description="PDFs, Word, Excel, PowerPoint, text, CSV and more." action={<Button onClick={onUpload}><UploadCloud className="h-4 w-4" /> Upload documents</Button>} />;
  if (inFolder)
    return (
      <div className="rounded-[14px] border-2 border-dashed border-line-strong">
        <EmptyState icon={UploadCloud} title="This folder is empty" description="Drop files here, or upload from your device." action={<Button onClick={onUpload}><UploadCloud className="h-4 w-4" /> Upload files</Button>} />
      </div>
    );
  return (
    <div className="rounded-[14px] border-2 border-dashed border-line-strong">
      <EmptyState
        icon={UploadCloud}
        title="Your private drive — drop files here"
        description="Keep documents, photos and anything worth holding on to in one calm place. Only you can see them."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onUpload}>
              <UploadCloud className="h-4 w-4" /> Upload files
            </Button>
            <Button variant="outline" onClick={onNewFolder}>
              <FolderPlus className="h-4 w-4" /> New folder
            </Button>
          </div>
        }
      />
    </div>
  );
}
