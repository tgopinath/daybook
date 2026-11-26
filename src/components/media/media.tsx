"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, FileText, ImagePlus, Loader2, Music, Play, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/components/ui/toast";
import { ACCEPT, uploadFile, type Media } from "@/lib/upload";

export type { Media };

// ------------------------------------------------------------------ uploader

type Pending = { key: string; name: string; progress: number };

/**
 * Upload button / drop zone. Calls onUploaded once per finished file.
 * `variant="zone"` renders a dashed drop area; `variant="button"` a compact button.
 */
export function MediaUploader({
  onUploaded,
  accept = ACCEPT.imagesAndVideos,
  multiple = true,
  label = "Add photos",
  hint = "Drag photos or videos here, or click to choose",
  variant = "zone",
  className,
  disabled,
}: {
  onUploaded: (m: Media) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  variant?: "zone" | "button";
  className?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);

  const handle = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, multiple ? 30 : 1);
      await Promise.all(
        list.map(async (file) => {
          const key = `${file.name}-${file.size}-${Math.random()}`;
          setPending((p) => [...p, { key, name: file.name, progress: 0 }]);
          try {
            const m = await uploadFile(file, { onProgress: (progress) => setPending((p) => p.map((x) => (x.key === key ? { ...x, progress } : x))) });
            onUploaded(m);
          } catch (err) {
            toastError(err);
          } finally {
            setPending((p) => p.filter((x) => x.key !== key));
          }
        }),
      );
    },
    [multiple, onUploaded],
  );

  const busy = pending.length > 0;
  const open = () => !disabled && input.current?.click();

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files?.length) void handle(e.target.files);
          e.target.value = "";
        }}
      />
      {variant === "button" ? (
        <button
          type="button"
          onClick={open}
          disabled={disabled || busy}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[14px] font-medium text-fg hover:bg-surface-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? `Uploading ${pending.length}…` : label}
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={disabled}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) void handle(e.dataTransfer.files);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed px-4 py-7 text-center transition-colors disabled:opacity-60",
            over ? "border-primary bg-primary-soft" : "border-line-strong hover:border-primary hover:bg-surface-2",
          )}
        >
          <ImagePlus className="h-6 w-6 text-primary" />
          <span className="text-[14px] font-medium text-fg">{label}</span>
          <span className="text-[12px] text-fg-3">{hint}</span>
        </button>
      )}
      {busy && (
        <ul className="mt-2 space-y-1.5" aria-live="polite">
          {pending.map((p) => (
            <li key={p.key} className="flex items-center gap-2 text-[12px] text-fg-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="tabular-nums">{Math.round(p.progress * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ thumbnail

/** Square (or `aspect`) preview of any media kind with a loading shimmer. */
export function MediaThumb({ media, alt = "", className, onClick }: { media: Pick<Media, "id" | "kind" | "url" | "originalName">; alt?: string; className?: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick, "aria-label": alt || "Open" } : {})}
      className={cn("relative block aspect-square w-full overflow-hidden rounded-[10px] bg-surface-2", className)}
    >
      {media.kind === "image" && (
        <>
          {!loaded && <span className="skeleton absolute inset-0 rounded-none" />}
          <img src={media.url} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} className="h-full w-full object-cover" />
        </>
      )}
      {media.kind === "video" && (
        <>
          <video src={`${media.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white">
              <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
            </span>
          </span>
        </>
      )}
      {(media.kind === "audio" || media.kind === "document" || media.kind === "file") && (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-fg-3">
          {media.kind === "audio" ? <Music className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
          <span className="line-clamp-2 text-center text-[11px]">{media.originalName}</span>
        </span>
      )}
    </Wrapper>
  );
}

// ------------------------------------------------------------------ grid

/** Responsive thumbnail grid; tap to open the viewer, optional remove button. */
export function MediaGrid({ items, onRemove, className, cols = "grid-cols-3 sm:grid-cols-4" }: { items: Media[]; onRemove?: (m: Media) => void; className?: string; cols?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className={cn("grid gap-2", cols, className)}>
        {items.map((m, i) => (
          <div key={m.id} className="group relative">
            <MediaThumb media={m} alt={m.originalName ?? ""} onClick={() => setOpen(i)} />
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(m)}
                className="absolute top-1.5 right-1.5 rounded-full bg-black/55 p-1 text-white opacity-100 transition-opacity hover:bg-black/75 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <MediaViewer items={items} index={open} onIndexChange={setOpen} />
    </>
  );
}

// ------------------------------------------------------------------ viewer

/** Full-screen viewer with ←/→ navigation, download and optional delete. */
export function MediaViewer({
  items,
  index,
  onIndexChange,
  onDelete,
  caption,
}: {
  items: Media[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
  onDelete?: (m: Media) => void;
  caption?: (m: Media) => React.ReactNode;
}) {
  const m = index !== null ? items[index] : undefined;
  const go = useCallback((d: number) => index !== null && items.length && onIndexChange((index + d + items.length) % items.length), [index, items.length, onIndexChange]);
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  return (
    <D.Root open={!!m} onOpenChange={(o) => !o && onIndexChange(null)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[70] bg-black/90" />
        <D.Content className="fixed inset-0 z-[70] flex flex-col outline-none" aria-describedby={undefined}>
          <D.Title className="sr-only">{m?.originalName || "Photo"}</D.Title>
          <div className="flex items-center justify-between gap-2 p-3 text-white">
            <span className="text-[13px] text-white tabular-nums">{index !== null ? `${index + 1} / ${items.length}` : ""}</span>
            <div className="flex items-center gap-1">
              {m && (
                <a href={`${m.url}?download=1`} className="rounded-lg p-2 hover:bg-white/10" aria-label="Download">
                  <Download className="h-5 w-5" />
                </a>
              )}
              {m && onDelete && (
                <button type="button" onClick={() => onDelete(m)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Delete">
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <D.Close className="rounded-lg p-2 hover:bg-white/10" aria-label="Close">
                <X className="h-5 w-5" />
              </D.Close>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2">
            {m?.kind === "image" && <img src={m.url} alt={m.originalName ?? ""} className="max-h-full max-w-full object-contain" />}
            {m?.kind === "video" && <video key={m.id} src={m.url} controls autoPlay playsInline className="max-h-full max-w-full" />}
            {m?.kind === "audio" && <audio key={m.id} src={m.url} controls autoPlay className="w-full max-w-md" />}
            {m?.kind === "document" && <iframe title={m.originalName ?? "Document"} src={m.url} className="h-full w-full max-w-4xl rounded bg-white" />}
            {items.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Previous">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Next">
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
          {m && caption && <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] text-center text-[14px] text-white">{caption(m)}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
