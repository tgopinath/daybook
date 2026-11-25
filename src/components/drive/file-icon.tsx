"use client";
import { File, FileArchive, FileAudio, FileImage, FileJson, FileSpreadsheet, FileText, FileVideo, Presentation, BookOpen, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { folderColorCss, typeLabel } from "@/lib/drive";

/** Icon for a file's type (colour comes from the theme, never a hard-coded text colour). */
export function FileTypeIcon({ mimeType, kind, className }: { mimeType: string; kind: string; className?: string }) {
  const label = typeLabel(mimeType, kind);
  const Icon =
    kind === "image" ? FileImage
    : kind === "video" ? FileVideo
    : kind === "audio" ? FileAudio
    : label === "Spreadsheet" || label === "CSV" ? FileSpreadsheet
    : label === "Presentation" ? Presentation
    : label === "JSON" ? FileJson
    : label === "ZIP" ? FileArchive
    : label === "EPUB" ? BookOpen
    : label === "File" ? File
    : FileText;
  return <Icon className={cn("h-5 w-5 text-fg-2", className)} aria-hidden />;
}

export function FolderIcon({ color, className }: { color: string | null; className?: string }) {
  return <Folder className={cn("h-5 w-5", className)} style={{ color: folderColorCss(color), fill: `color-mix(in oklab, ${folderColorCss(color)} 18%, transparent)` }} aria-hidden />;
}
