"use client";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/ai/types";

/** Honest "no API key" state shown on every AI surface. */
export function AINotConfigured({ className, compact }: { className?: string; compact?: boolean }) {
  // AppShell marks <html data-demo> in demo mode (public deployment without a database or API key).
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(document.documentElement.dataset.demo === "1"), []);
  if (demo)
    return (
      <div role="status" className={cn("flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-2/60 text-fg-2", compact ? "p-2.5 text-[12px]" : "p-3.5 text-[14px]", className)}>
        <KeyRound className={cn("mt-0.5 shrink-0 text-fg-3", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        <div className="min-w-0">
          <p className="font-medium text-fg">AI is off in this demo</p>
          <p className="mt-0.5 leading-relaxed">The assistant needs an API key on a private deployment. Everything else works with the sample data.</p>
        </div>
      </div>
    );
  return (
    <div role="status" className={cn("flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-2/60 text-fg-2", compact ? "p-2.5 text-[12px]" : "p-3.5 text-[14px]", className)}>
      <KeyRound className={cn("mt-0.5 shrink-0 text-fg-3", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <div className="min-w-0">
        <p className="font-medium text-fg">AI isn&apos;t configured</p>
        <p className="mt-0.5 leading-relaxed">
          Add <code className="rounded bg-surface px-1 font-mono text-[0.92em]">ANTHROPIC_API_KEY</code> (or{" "}
          <code className="rounded bg-surface px-1 font-mono text-[0.92em]">OPENAI_API_KEY</code>) to <code className="rounded bg-surface px-1 font-mono text-[0.92em]">.env</code> and restart the server. Everything else works without it.
        </p>
      </div>
    </div>
  );
}

export const NOT_CONFIGURED_TITLE = NOT_CONFIGURED_MESSAGE;
