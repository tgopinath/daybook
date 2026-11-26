"use client";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** One-time display of backup codes, with copy and download. The codes are never shown again. */
export function BackupCodesList({ codes }: { codes: string[] }) {
  const text = `My Diary backup codes\nEach code can be used once to sign in if you don't have your authenticator app.\n\n${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Backup codes copied");
    } catch {
      toast.error("Couldn't copy. Select the codes and copy them instead.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mydiary-backup-codes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      <p className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] leading-snug text-warning-text">
        Save these codes somewhere safe, like a password manager. Each one works once, and you won&apos;t see them again.
      </p>
      <ul aria-label="Backup codes" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface-2 p-4 font-mono text-[14px] tracking-wide text-fg select-all">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="h-3.5 w-3.5" aria-hidden /> Download .txt
        </Button>
      </div>
    </div>
  );
}
