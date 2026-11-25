"use client";
import { useMemo, useState } from "react";
import { ChevronRight, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriveFolderDTO } from "@/lib/drive";
import { FolderIcon } from "./file-icon";

export const DRAG_MIME = "application/x-mydiary-drive";
export type DragPayload = { fileIds: string[]; folderIds: string[] };

export function readDrag(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}
export const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
export const isItemDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_MIME);

/** Drop-target props shared by tree rows, folder tiles and breadcrumbs. */
export function useDropTarget(onItems: (p: DragPayload) => void, onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!isFileDrag(e) && !isItemDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = isFileDrag(e) ? "copy" : "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        if (!isFileDrag(e) && !isItemDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (isFileDrag(e)) onFiles(Array.from(e.dataTransfer.files));
        else {
          const p = readDrag(e);
          if (p) onItems(p);
        }
      },
    },
  };
}

type Props = {
  folders: DriveFolderDTO[];
  currentId: string | null;
  active: boolean;
  onOpen: (id: string | null) => void;
  onMoveInto: (target: string | null, p: DragPayload) => void;
  onUploadInto: (target: string | null, files: File[]) => void;
};

/** Desktop sidebar tree of folders ("My Storage" is the root). Folders accept dropped items and files. */
export function FolderTree({ folders, currentId, active, onOpen, onMoveInto, onUploadInto }: Props) {
  const children = useMemo(() => {
    const m = new Map<string | null, DriveFolderDTO[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    return m;
  }, [folders]);
  // Ancestors of the open folder start expanded; the user can still collapse them.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const ancestors = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const s = new Set<string>();
    let cur = currentId ? byId.get(currentId) : undefined;
    while (cur?.parentId && !s.has(cur.parentId)) {
      s.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    return s;
  }, [folders, currentId]);
  const isOpen = (id: string) => !collapsed.has(id) && (expanded.has(id) || ancestors.has(id));
  const toggle = (id: string) => {
    const open = isOpen(id);
    setExpanded((s) => {
      const n = new Set(s);
      if (open) n.delete(id);
      else n.add(id);
      return n;
    });
    setCollapsed((s) => {
      const n = new Set(s);
      if (open) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const root = useDropTarget(
    (p) => onMoveInto(null, p),
    (files) => onUploadInto(null, files),
  );

  return (
    <nav aria-label="Folders" className="space-y-0.5">
      <button
        type="button"
        onClick={() => onOpen(null)}
        {...root.props}
        aria-current={active && currentId === null ? "page" : undefined}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[13.5px] font-medium transition-colors",
          active && currentId === null ? "bg-primary-soft text-primary" : "text-fg hover:bg-surface-2",
          root.over && "ring-2 ring-primary",
        )}
      >
        <HardDrive className="h-4 w-4 shrink-0" aria-hidden />
        All files
      </button>
      <ul role="tree" aria-label="Folder tree">
        {(children.get(null) ?? []).map((f) => (
          <TreeNode key={f.id} folder={f} depth={0} children_={children} isOpen={isOpen} toggle={toggle} currentId={active ? currentId : "__none"} onOpen={onOpen} onMoveInto={onMoveInto} onUploadInto={onUploadInto} />
        ))}
      </ul>
    </nav>
  );
}

function TreeNode({
  folder,
  depth,
  children_,
  isOpen,
  toggle,
  currentId,
  onOpen,
  onMoveInto,
  onUploadInto,
}: {
  folder: DriveFolderDTO;
  depth: number;
  children_: Map<string | null, DriveFolderDTO[]>;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  currentId: string | null;
  onOpen: (id: string | null) => void;
  onMoveInto: (target: string | null, p: DragPayload) => void;
  onUploadInto: (target: string | null, files: File[]) => void;
}) {
  const kids = children_.get(folder.id) ?? [];
  const open = isOpen(folder.id);
  const current = currentId === folder.id;
  const drop = useDropTarget(
    (p) => onMoveInto(folder.id, p),
    (files) => onUploadInto(folder.id, files),
  );
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={current}>
      <div
        {...drop.props}
        className={cn("group flex h-8 items-center rounded-[10px] pr-1 transition-colors", current ? "bg-primary-soft" : "hover:bg-surface-2", drop.over && "ring-2 ring-primary")}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => toggle(folder.id)}
          className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 hover:text-fg", !kids.length && "invisible")}
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          tabIndex={kids.length ? 0 : -1}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button type="button" onClick={() => onOpen(folder.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]", current ? "font-medium text-primary" : "text-fg")} aria-current={current ? "page" : undefined}>
          <FolderIcon color={folder.color} className="h-4 w-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map((k) => (
            <TreeNode key={k.id} folder={k} depth={depth + 1} children_={children_} isOpen={isOpen} toggle={toggle} currentId={currentId} onOpen={onOpen} onMoveInto={onMoveInto} onUploadInto={onUploadInto} />
          ))}
        </ul>
      )}
    </li>
  );
}
