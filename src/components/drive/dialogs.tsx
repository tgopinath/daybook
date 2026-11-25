"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FOLDER_COLORS, descendantIds, type DriveFolderDTO } from "@/lib/drive";
import { FolderIcon } from "./file-icon";

/** Create / rename a folder (with colour) or rename a file. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initialName,
  initialColor,
  withColor,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  label: string;
  initialName: string;
  initialColor?: string | null;
  withColor?: boolean;
  submitLabel: string;
  onSubmit: (name: string, color: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor ?? null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setColor(initialColor ?? null);
    // Select the name without the extension, like a desktop file manager.
    const t = setTimeout(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      const dot = initialName.lastIndexOf(".");
      el.setSelectionRange(0, !withColor && dot > 0 ? dot : initialName.length);
    }, 30);
    return () => clearTimeout(t);
  }, [open, initialName, initialColor, withColor]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim(), color);
      onOpenChange(false);
    } catch {
      /* the caller shows the error */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!name.trim()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={label}>
          <Input ref={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />
        </Field>
        {withColor && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-fg-2">Colour</legend>
            <div className="flex flex-wrap gap-2">
              <ColorSwatch label="Default" css="var(--text-3)" selected={color === null} onClick={() => setColor(null)} />
              {FOLDER_COLORS.map((c) => (
                <ColorSwatch key={c.value} label={c.label} css={c.css} selected={color === c.value} onClick={() => setColor(c.value)} />
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Dialog>
  );
}

function ColorSwatch({ label, css, selected, onClick }: { label: string; css: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105", selected ? "border-fg" : "border-transparent")}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: css }}>
        {selected && <Check className="h-3.5 w-3.5 text-white" />}
      </span>
    </button>
  );
}

/** "Move to…": pick a destination folder. Folders being moved (and their subfolders) can't be chosen. */
export function MoveDialog({
  open,
  onOpenChange,
  folders,
  movingFolderIds,
  currentFolderId,
  count,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folders: DriveFolderDTO[];
  movingFolderIds: string[];
  currentFolderId: string | null;
  count: number;
  onMove: (target: string | null) => Promise<void>;
}) {
  const [target, setTarget] = useState<string | null>(currentFolderId);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) {
      setTarget(null);
      setExpanded(new Set());
    }
  }, [open]);

  const blocked = useMemo(() => new Set([...movingFolderIds, ...descendantIds(folders, movingFolderIds)]), [folders, movingFolderIds]);
  const children = useMemo(() => {
    const m = new Map<string | null, DriveFolderDTO[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return m;
  }, [folders]);

  const submit = async () => {
    setBusy(true);
    try {
      await onMove(target);
      onOpenChange(false);
    } catch {
      /* caller shows the error */
    } finally {
      setBusy(false);
    }
  };

  const row = (f: DriveFolderDTO, depth: number): React.ReactNode => {
    const kids = children.get(f.id) ?? [];
    const isBlocked = blocked.has(f.id);
    const isOpen = expanded.has(f.id);
    return (
      <li key={f.id}>
        <div className={cn("flex min-h-11 items-center rounded-[10px] pr-2", target === f.id ? "bg-primary-soft" : "hover:bg-surface-2")} style={{ paddingLeft: 4 + depth * 16 }}>
          <button
            type="button"
            className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg-3 hover:text-fg", !kids.length && "invisible")}
            onClick={() =>
              setExpanded((s) => {
                const n = new Set(s);
                if (n.has(f.id)) n.delete(f.id);
                else n.add(f.id);
                return n;
              })
            }
            aria-label={isOpen ? `Collapse ${f.name}` : `Expand ${f.name}`}
            tabIndex={kids.length ? 0 : -1}
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
          </button>
          <button
            type="button"
            disabled={isBlocked}
            onClick={() => setTarget(f.id)}
            aria-pressed={target === f.id}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-[14px] text-fg disabled:cursor-not-allowed disabled:text-fg-3"
          >
            <FolderIcon color={f.color} className="h-4 w-4 shrink-0" />
            <span className="truncate">{f.name}</span>
            {isBlocked && <span className="text-[12px] text-fg-3">(being moved)</span>}
            {target === f.id && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />}
          </button>
        </div>
        {isOpen && kids.length > 0 && <ul>{kids.map((k) => row(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${count === 1 ? "1 item" : `${count} items`}`}
      description="Choose where it should go."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={target !== null && blocked.has(target)}>
            Move here
          </Button>
        </>
      }
    >
      <ul className="-mx-2 space-y-0.5" aria-label="Destination folders">
        <li>
          <button
            type="button"
            onClick={() => setTarget(null)}
            aria-pressed={target === null}
            className={cn("flex min-h-11 w-full items-center gap-2 rounded-[10px] px-3 text-left text-[14px] font-medium text-fg", target === null ? "bg-primary-soft" : "hover:bg-surface-2")}
          >
            <HardDrive className="h-4 w-4 text-fg-2" aria-hidden />
            My Storage (top level)
            {target === null && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden />}
          </button>
        </li>
        {(children.get(null) ?? []).map((f) => row(f, 0))}
      </ul>
    </Dialog>
  );
}
