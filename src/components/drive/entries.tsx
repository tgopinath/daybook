"use client";
import { forwardRef, useRef } from "react";
import { format, isThisYear } from "date-fns";
import { ArrowDown, ArrowUp, MoreHorizontal, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/input";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { MediaThumb } from "@/components/media/media";
import { cn } from "@/lib/utils";
import { formatBytes, typeLabel, type DriveFileDTO, type DriveFolderDTO, type DriveSort, type SortDir } from "@/lib/drive";
import { FileTypeIcon, FolderIcon } from "./file-icon";
import { DRAG_MIME, useDropTarget, type DragPayload } from "./folder-tree";

export type Entry =
  | { key: string; type: "folder"; folder: DriveFolderDTO & { path?: string } }
  | { key: string; type: "file"; file: DriveFileDTO };

export const entryName = (e: Entry) => (e.type === "folder" ? e.folder.name : e.file.name);

export function shortDate(iso: string) {
  const d = new Date(iso);
  return format(d, isThisYear(d) ? "d MMM" : "d MMM yyyy");
}

export type EntryHandlers = {
  /** Click / tap on the item body (open, or toggle when selecting). */
  onActivate: (index: number, e: React.MouseEvent) => void;
  onToggle: (index: number, shift: boolean) => void;
  onLongPress: (index: number) => void;
  onFocusIndex: (index: number) => void;
  menuItems: (entry: Entry) => MenuItem[];
  /** Mobile: "⋯" opens a bottom sheet instead of a dropdown. */
  onOpenSheet?: (entry: Entry) => void;
  dragPayload: (index: number) => DragPayload | null;
  onMoveInto: (folderId: string, p: DragPayload) => void;
  onUploadInto: (folderId: string, files: File[]) => void;
  onStar: (file: DriveFileDTO) => void;
  registerButton: (index: number, el: HTMLButtonElement | null) => void;
};

type ItemProps = {
  entry: Entry;
  index: number;
  selected: boolean;
  selecting: boolean;
  focused: boolean;
  showPath: boolean;
  trash: boolean;
  h: EntryHandlers;
};

/** Long-press (touch) to start selecting; suppresses the click that follows. */
function useLongPress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    fired,
    props: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") return;
        fired.current = false;
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onLong();
        }, 480);
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerMove: (e: React.PointerEvent) => {
        if (e.pointerType === "touch" && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) clear();
      },
      onContextMenu: (e: React.MouseEvent) => {
        if (fired.current) e.preventDefault();
      },
    },
  };
}

function useItem({ entry, index, h, trash }: ItemProps) {
  const isFolder = entry.type === "folder";
  const long = useLongPress(() => h.onLongPress(index));
  const drop = useDropTarget(
    (p) => isFolder && !trash && h.onMoveInto(entry.folder.id, p),
    (files) => isFolder && !trash && h.onUploadInto(entry.folder.id, files),
  );
  const dragProps = trash
    ? {}
    : {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          const p = h.dragPayload(index);
          if (!p) return e.preventDefault();
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(p));
          e.dataTransfer.effectAllowed = "move";
        },
      };
  const activate = (e: React.MouseEvent) => {
    if (long.fired.current) {
      long.fired.current = false;
      return;
    }
    h.onActivate(index, e);
  };
  return { isFolder, long, drop: isFolder && !trash ? drop : null, dragProps, activate };
}

const MenuButton = ({ entry, h, className }: { entry: Entry; h: EntryHandlers; className?: string }) =>
  h.onOpenSheet ? (
    <button type="button" onClick={() => h.onOpenSheet!(entry)} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-fg-2 hover:bg-surface-2 hover:text-fg", className)} aria-label={`Actions for ${entryName(entry)}`}>
      <MoreHorizontal className="h-5 w-5" />
    </button>
  ) : (
    <Menu
      items={h.menuItems(entry)}
      trigger={
        <button type="button" className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2", className)} aria-label={`Actions for ${entryName(entry)}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      }
    />
  );

// ------------------------------------------------------------------ list row

export const ListRow = forwardRef<HTMLLIElement, ItemProps>(function ListRow(props, ref) {
  const { entry, index, selected, selecting, focused, showPath, trash, h } = props;
  const { isFolder, long, drop, dragProps, activate } = useItem(props);
  const name = entryName(entry);
  const file = entry.type === "file" ? entry.file : null;
  const folder = entry.type === "folder" ? entry.folder : null;
  const meta = isFolder
    ? [folder!.path || (showPath ? "My Storage" : null), "Folder"].filter(Boolean).join(" · ")
    : [showPath ? file!.path || "My Storage" : null, typeLabel(file!.media.mimeType, file!.media.kind), formatBytes(file!.media.size)].filter(Boolean).join(" · ");
  return (
    <li
      ref={ref}
      data-index={index}
      {...dragProps}
      {...(drop?.props ?? {})}
      className={cn(
        "group relative flex min-h-14 items-center gap-2 border-b border-line px-2 transition-colors last:border-b-0 md:min-h-12",
        selected ? "bg-primary-soft" : "hover:bg-surface-2",
        drop?.over && "ring-2 ring-primary ring-inset",
        focused && "z-[1]",
      )}
    >
      <span className={cn("flex h-11 w-9 shrink-0 items-center justify-center md:h-9", !selecting && !selected && "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100")}>
        <Checkbox checked={selected} onChange={() => h.onToggle(index, false)} label={`Select ${name}`} size={20} />
      </span>
      <button
        type="button"
        ref={(el) => h.registerButton(index, el)}
        onClick={activate}
        onFocus={() => h.onFocusIndex(index)}
        {...long.props}
        tabIndex={focused ? 0 : -1}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-offset-2"
        aria-label={`${name}${isFolder ? ", folder" : ""}`}
        aria-describedby={`m-${entry.key}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-surface-2">
          {isFolder ? (
            <FolderIcon color={folder!.color} />
          ) : file!.media.kind === "image" ? (
            <img src={file!.media.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <FileTypeIcon mimeType={file!.media.mimeType} kind={file!.media.kind} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-fg">{name}</span>
          <span id={`m-${entry.key}`} className="block truncate text-[12px] text-fg-3 md:hidden">
            {meta}
            {file ? ` · ${shortDate(file.createdAt)}` : ""}
          </span>
          {showPath && <span className="hidden truncate text-[12px] text-fg-3 md:block">{isFolder ? folder!.path || "My Storage" : file!.path || "My Storage"}</span>}
        </span>
      </button>
      <span className="hidden w-28 shrink-0 truncate text-[12.5px] text-fg-2 md:block">{isFolder ? "Folder" : typeLabel(file!.media.mimeType, file!.media.kind)}</span>
      <span className="hidden w-20 shrink-0 text-right text-[12.5px] text-fg-2 tabular-nums md:block">{file ? formatBytes(file.media.size) : "—"}</span>
      <span className="hidden w-24 shrink-0 text-right text-[12.5px] text-fg-2 tabular-nums md:block">{shortDate(trash && (isFolder ? folder!.deletedAt : file!.deletedAt) ? (isFolder ? folder!.deletedAt! : file!.deletedAt!) : isFolder ? folder!.updatedAt : file!.updatedAt)}</span>
      <span className="hidden w-8 shrink-0 md:block">
        {file && !trash && (
          <button
            type="button"
            onClick={() => h.onStar(file)}
            className={cn("flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2", file.starred ? "text-primary" : "text-fg-3 opacity-0 group-hover:opacity-100 focus:opacity-100")}
            aria-label={file.starred ? `Unstar ${name}` : `Star ${name}`}
            aria-pressed={file.starred}
          >
            <Star className="h-4 w-4" fill={file.starred ? "currentColor" : "none"} />
          </button>
        )}
      </span>
      {file?.starred && !trash && <Star className="h-3.5 w-3.5 shrink-0 text-primary md:hidden" fill="currentColor" aria-label="Starred" />}
      <MenuButton entry={entry} h={h} />
    </li>
  );
});

export function ListHeader({ sort, dir, onSort, showPath, trash }: { sort: DriveSort; dir: SortDir; onSort: (s: DriveSort) => void; showPath: boolean; trash: boolean }) {
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  const col = (s: DriveSort, label: string, className: string) => (
    <button type="button" onClick={() => onSort(s)} className={cn("inline-flex items-center gap-1 text-[12px] font-medium text-fg-2 hover:text-fg", className)} aria-label={`Sort by ${label}${sort === s ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}>
      {label}
      {sort === s && <Arrow className="h-3 w-3" aria-hidden />}
    </button>
  );
  return (
    <div className="hidden h-9 items-center gap-2 border-b border-line px-2 md:flex" aria-hidden={false}>
      <span className="w-9 shrink-0" />
      <span className="min-w-0 flex-1 pl-[52px]">{col("name", showPath ? "Name & location" : "Name", "")}</span>
      <span className="w-28 shrink-0">{col("type", "Type", "")}</span>
      <span className="w-20 shrink-0 text-right">{col("size", "Size", "justify-end")}</span>
      <span className="w-24 shrink-0 text-right">{col("date", trash ? "Deleted" : "Modified", "justify-end")}</span>
      <span className="w-8 shrink-0" />
      <span className="w-8 shrink-0" />
    </div>
  );
}

// ------------------------------------------------------------------ grid

export const FolderTile = forwardRef<HTMLDivElement, ItemProps>(function FolderTile(props, ref) {
  const { entry, index, selected, selecting, focused, showPath, h } = props;
  const { long, drop, dragProps, activate } = useItem(props);
  if (entry.type !== "folder") return null;
  return (
    <div
      ref={ref}
      data-index={index}
      {...dragProps}
      {...(drop?.props ?? {})}
      className={cn(
        "group relative flex h-14 items-center gap-2 rounded-[12px] border pr-1 pl-2 transition-colors",
        selected ? "border-primary bg-primary-soft" : "border-line bg-surface hover:bg-surface-2",
        drop?.over && "ring-2 ring-primary",
      )}
    >
      <span className={cn("flex shrink-0", !selecting && !selected && "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
        <Checkbox checked={selected} onChange={() => h.onToggle(index, false)} label={`Select ${entry.folder.name}`} />
      </span>
      <button
        type="button"
        ref={(el) => h.registerButton(index, el)}
        onClick={activate}
        onFocus={() => h.onFocusIndex(index)}
        {...long.props}
        tabIndex={focused ? 0 : -1}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
        aria-label={`${entry.folder.name}, folder`}
      >
        <FolderIcon color={entry.folder.color} className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium text-fg">{entry.folder.name}</span>
          {showPath && <span className="block truncate text-[11.5px] text-fg-3">{entry.folder.path || "My Storage"}</span>}
        </span>
      </button>
      <MenuButton entry={entry} h={h} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 md:data-[state=open]:opacity-100" />
    </div>
  );
});

export const FileTile = forwardRef<HTMLDivElement, ItemProps>(function FileTile(props, ref) {
  const { entry, index, selected, selecting, focused, showPath, trash, h } = props;
  const { long, dragProps, activate } = useItem(props);
  if (entry.type !== "file") return null;
  const f = entry.file;
  const visual = f.media.kind === "image" || f.media.kind === "video";
  return (
    <div
      ref={ref}
      data-index={index}
      {...dragProps}
      className={cn("group relative flex flex-col overflow-hidden rounded-[12px] border transition-colors", selected ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong")}
    >
      <button
        type="button"
        ref={(el) => h.registerButton(index, el)}
        onClick={activate}
        onFocus={() => h.onFocusIndex(index)}
        {...long.props}
        tabIndex={focused ? 0 : -1}
        className="block w-full text-left"
        aria-label={`${f.name}, ${typeLabel(f.media.mimeType, f.media.kind)}, ${formatBytes(f.media.size)}`}
      >
        <span className="block p-1.5 pb-0">
          {visual ? (
            <MediaThumb media={{ ...f.media, originalName: f.name }} className="pointer-events-none rounded-[8px]" />
          ) : (
            <span className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[8px] bg-surface-2">
              <FileTypeIcon mimeType={f.media.mimeType} kind={f.media.kind} className="h-9 w-9" />
              <span className="text-[11px] font-medium tracking-wide text-fg-2 uppercase">{typeLabel(f.media.mimeType, f.media.kind)}</span>
            </span>
          )}
        </span>
        <span className="block px-2.5 pt-2 pr-10 pb-2.5">
          <span className="block truncate text-[14px] font-medium text-fg">{f.name}</span>
          <span className="block truncate text-[11.5px] text-fg-3">{showPath ? f.path || "My Storage" : `${formatBytes(f.media.size)} · ${shortDate(f.createdAt)}`}</span>
        </span>
      </button>
      <span className={cn("absolute top-2.5 left-2.5 rounded-full bg-surface shadow-card", !selecting && !selected && "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
        <Checkbox checked={selected} onChange={() => h.onToggle(index, false)} label={`Select ${f.name}`} size={20} />
      </span>
      {f.starred && !trash && (
        <span className="absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-primary shadow-card" aria-label="Starred">
          <Star className="h-3.5 w-3.5" fill="currentColor" />
        </span>
      )}
      <span className="absolute right-1.5 bottom-1.5">
        <MenuButton entry={entry} h={h} className="bg-surface opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 md:data-[state=open]:opacity-100" />
      </span>
    </div>
  );
});
