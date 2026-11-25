"use client";
import { useApi } from "@/lib/client";
import { formatBytes } from "@/lib/drive";
import { Skeleton } from "@/components/ui/misc";

type Usage = { totalBytes: number; kinds: { kind: string; bytes: number; count: number }[]; driveFiles: number; trashedFiles: number };

const KIND_META: Record<string, { label: string; color: string }> = {
  image: { label: "Photos", color: "var(--primary)" },
  video: { label: "Videos", color: "#3b82f6" },
  audio: { label: "Audio", color: "#d97706" },
  document: { label: "PDFs", color: "#16a34a" },
  file: { label: "Documents & files", color: "#64748b" },
};

/** Storage used across MyDiary (everything you've uploaded), split by kind. Display only — no quota. */
export function UsageMeter({ compact }: { compact?: boolean }) {
  const { data, isLoading } = useApi<Usage>("/api/drive/usage");
  if (isLoading && !data) return <Skeleton className="h-16 w-full" />;
  if (!data) return null;
  const total = data.totalBytes;
  return (
    <section aria-label="Storage used" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-fg-2">Storage used</span>
        <span className="font-display text-[15px] font-semibold text-fg tabular-nums">{formatBytes(total)}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={data.kinds.map((k) => `${KIND_META[k.kind]?.label ?? k.kind} ${formatBytes(k.bytes)}`).join(", ") || "Nothing stored yet"}>
        {total > 0 &&
          data.kinds.map((k) => (
            <span key={k.kind} style={{ width: `${Math.max(2, (k.bytes / total) * 100)}%`, background: KIND_META[k.kind]?.color ?? "var(--text-3)" }} className="h-full" />
          ))}
      </div>
      {!compact && (
        <ul className="space-y-1">
          {data.kinds.map((k) => (
            <li key={k.kind} className="flex items-center gap-2 text-[12px] text-fg-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_META[k.kind]?.color ?? "var(--text-3)" }} aria-hidden />
              <span className="flex-1 truncate">{KIND_META[k.kind]?.label ?? k.kind}</span>
              <span className="tabular-nums">{formatBytes(k.bytes)}</span>
            </li>
          ))}
          {!data.kinds.length && <li className="text-[12px] text-fg-3">Nothing stored yet.</li>}
        </ul>
      )}
      <p className="text-[11.5px] leading-snug text-fg-3">Includes photos and files from every part of MyDiary.</p>
    </section>
  );
}
