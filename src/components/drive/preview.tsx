"use client";
import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/client";
import { formatBytes, isTextPreviewable, typeLabel, type DriveFileDTO } from "@/lib/drive";
import { format } from "date-fns";
import { FileTypeIcon } from "./file-icon";

export const downloadUrl = (f: Pick<DriveFileDTO, "media">) => `${f.media.url}?download=1`;

/**
 * Preview for files the media viewer can't show: text-like files as plain text in a <pre>
 * (first 1 MB, never rendered as HTML), anything else as an icon card with Download.
 */
export function FileCardPreview({ file, onOpenChange }: { file: DriveFileDTO | null; onOpenChange: (o: boolean) => void }) {
  const textual = !!file && isTextPreviewable(file.media.mimeType);
  const [state, setState] = useState<{ id: string; text: string; truncated: boolean } | { id: string; error: string } | null>(null);

  useEffect(() => {
    if (!file || !textual) return;
    let alive = true;
    setState(null);
    api
      .get<{ text: string; truncated: boolean }>(`/api/drive/files/${file.id}/text`)
      .then((r) => alive && setState({ id: file.id, text: r.text, truncated: r.truncated }))
      .catch((err: Error) => alive && setState({ id: file.id, error: err.message }));
    return () => {
      alive = false;
    };
  }, [file, textual]);

  const ready = state && file && state.id === file.id ? state : null;

  return (
    <Dialog
      open={!!file}
      onOpenChange={onOpenChange}
      title={<span className="break-all">{file?.name ?? ""}</span>}
      description={file ? `${typeLabel(file.media.mimeType, file.media.kind)} · ${formatBytes(file.media.size)} · Added ${format(new Date(file.createdAt), "d MMM yyyy")}` : undefined}
      size={textual ? "lg" : "sm"}
      footer={
        file && (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <a href={downloadUrl(file)} className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-primary px-3.5 text-sm font-medium text-on-primary hover:bg-primary-hover">
              <Download className="h-4 w-4" /> Download
            </a>
          </>
        )
      }
    >
      {file && textual ? (
        !ready ? (
          <p className="flex items-center gap-2 py-8 text-[13.5px] text-fg-2" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading preview…
          </p>
        ) : "error" in ready ? (
          <p className="py-6 text-[13.5px] text-danger">{ready.error}</p>
        ) : (
          <>
            <pre className="max-h-[60dvh] overflow-auto rounded-[10px] border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-fg scroll-thin">{ready.text || "(This file is empty)"}</pre>
            {ready.truncated && <p className="mt-2 text-[12px] text-fg-3">Showing the first 1 MB. Download the file to see all of it.</p>}
          </>
        )
      ) : file ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
            <FileTypeIcon mimeType={file.media.mimeType} kind={file.media.kind} className="h-8 w-8" />
          </span>
          <p className="max-w-xs text-[13.5px] text-fg-2">There&apos;s no preview for this kind of file. Download it to open it on your device.</p>
        </div>
      ) : null}
    </Dialog>
  );
}
