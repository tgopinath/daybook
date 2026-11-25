"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as T from "@radix-ui/react-tooltip";
import { AlertCircle, CheckCircle2, ExternalLink, Images, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useApi } from "@/lib/client";
import { browserTz } from "@/lib/time";

type Status = { available: boolean; reason: string | null; message: string | null; connected: boolean; expiresAt: string | null };
type Session = { id: string; pickerUri: string; pickerWindowUrl: string | null; pollIntervalMs: number; timeoutMs: number };
type ImportResult = {
  total: number;
  imported: number;
  reused: number;
  failed: { id: string; name: string; error: string }[];
  remaining: number;
  done: boolean;
  memoryId: string | null;
  photosAdded: number;
};
export type GooglePhotosImported = { memoryId: string | null; imported: number; total: number };

class GpError extends Error {
  constructor(
    message: string,
    public reconnect = false,
  ) {
    super(message);
  }
}

/** Like api.* but a 401 { reconnect } means "connect Google Photos again" rather than "signed out". */
async function gp<T>(method: string, url: string, data?: unknown): Promise<T> {
  let tz = "UTC";
  try {
    tz = localStorage.getItem("pad-tz") || browserTz();
  } catch {
    tz = browserTz();
  }
  const res = await fetch(url, { method, headers: { "content-type": "application/json", "x-tz": tz }, body: data === undefined ? undefined : JSON.stringify(data), credentials: "same-origin" });
  const json = (await res.json().catch(() => null)) as { error?: string; reconnect?: boolean } | null;
  if (res.status === 401 && !json?.reconnect) {
    window.location.href = `/login?reason=expired&next=${encodeURIComponent(location.pathname)}`;
  }
  if (!res.ok) throw new GpError(json?.error ?? `Request failed (${res.status})`, !!json?.reconnect);
  return json as T;
}

const RETURN_MESSAGES: Record<string, string> = {
  cancelled: "Google Photos wasn't connected — access was cancelled.",
  denied: "Google Photos access wasn't granted, so nothing can be imported.",
  expired: "That connection attempt expired. Please try again.",
  error: "Couldn't connect Google Photos. Please try again.",
  demo: "Importing from Google Photos isn't available in the demo.",
  not_configured: "Google Photos import isn't set up on this server yet.",
  no_storage: "Photo storage isn't set up on this server yet.",
  no_encryption: "Google Photos import isn't fully set up on this server yet.",
};

type Step = "connect" | "ready" | "picking" | "importing" | "done";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "Import from Google Photos": connect (OAuth) → pick in Google's picker → import in batches.
 * target "photos" adds to the Photo Diary; "memory" adds to `memoryId` (or creates a new memory).
 */
export function GooglePhotosImport({
  target,
  memoryId,
  collectionId,
  returnPath,
  onImported,
  label = "Import from Google Photos",
  size = "md",
}: {
  target: "photos" | "memory";
  memoryId?: string;
  collectionId?: string | null;
  returnPath: string;
  onImported?: (r: GooglePhotosImported) => void;
  label?: string;
  size?: "sm" | "md";
}) {
  const { data: status, mutate: reloadStatus } = useApi<Status>("/api/google-photos/status");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("ready");
  const [note, setNote] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ imported: number; reused: number; failed: ImportResult["failed"]; memoryId: string | null } | null>(null);
  const cancelled = useRef(false);

  // Returning from Google's consent screen: /photos?gp=connected
  useEffect(() => {
    const url = new URL(window.location.href);
    const gpParam = url.searchParams.get("gp");
    if (!gpParam) return;
    url.searchParams.delete("gp");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (gpParam === "connected") {
      toast.success("Google Photos connected");
      void reloadStatus();
      setStep("ready");
      setNote(null);
      setOpen(true);
    } else {
      toast.error(RETURN_MESSAGES[gpParam] ?? RETURN_MESSAGES.error!);
    }
  }, [reloadStatus]);

  const connectUrl = `/api/google-photos/connect?return=${encodeURIComponent(returnPath)}`;

  const start = () => {
    cancelled.current = false;
    setResult(null);
    setBlockedUrl(null);
    setNote(null);
    setStep(status?.connected ? "ready" : "connect");
    setOpen(true);
  };

  const fail = useCallback((err: unknown) => {
    if (err instanceof GpError && err.reconnect) {
      setStep("connect");
      setNote(err.message);
      void reloadStatus();
      return;
    }
    setNote(err instanceof Error ? err.message : "Something went wrong");
    setStep((s) => (s === "importing" ? "done" : "ready"));
  }, [reloadStatus]);

  const runImport = useCallback(
    async (s: Session) => {
      setStep("importing");
      let mid = memoryId ?? null;
      const skipIds: string[] = [];
      const failed: ImportResult["failed"] = [];
      let imported = 0;
      let reused = 0;
      for (let i = 0; i < 100 && !cancelled.current; i++) {
        const r = await gp<ImportResult>("POST", `/api/google-photos/sessions/${encodeURIComponent(s.id)}/import`, {
          target,
          memoryId: mid ?? undefined,
          collectionId: target === "photos" ? (collectionId ?? null) : undefined,
          skipIds,
        });
        mid = r.memoryId ?? mid;
        imported += r.imported;
        reused = r.reused;
        for (const f of r.failed) {
          failed.push(f);
          skipIds.push(f.id);
        }
        setProgress({ done: r.total - r.remaining, total: r.total });
        if (r.done) break;
      }
      setResult({ imported, reused, failed, memoryId: mid });
      setStep("done");
      onImported?.({ memoryId: mid, imported: imported + reused, total: imported + reused + failed.length });
    },
    [memoryId, target, collectionId, onImported],
  );

  const choose = async () => {
    cancelled.current = false;
    setNote(null);
    // Open the tab synchronously (inside the click) so pop-up blockers allow it, then point it at the picker.
    const win = window.open("", "_blank");
    try {
      const s = await gp<Session>("POST", "/api/google-photos/sessions");
      setSession(s);
      const pickUrl = s.pickerWindowUrl ?? s.pickerUri;
      if (win) win.location.href = pickUrl;
      else setBlockedUrl(pickUrl);
      setStep("picking");
      const deadline = Date.now() + Math.min(s.timeoutMs, 30 * 60_000);
      let interval = s.pollIntervalMs;
      while (!cancelled.current) {
        await sleep(interval);
        if (cancelled.current) return;
        if (Date.now() > deadline) throw new GpError("The Google Photos picker timed out. Try again.");
        const poll = await gp<{ mediaItemsSet: boolean; pollIntervalMs: number }>("GET", `/api/google-photos/sessions/${encodeURIComponent(s.id)}`);
        interval = poll.pollIntervalMs || interval;
        if (poll.mediaItemsSet) break;
      }
      if (cancelled.current) return;
      await runImport(s);
    } catch (err) {
      win?.close();
      fail(err);
    }
  };

  const cancel = () => {
    cancelled.current = true;
    if (session && step === "picking") void gp("DELETE", `/api/google-photos/sessions/${encodeURIComponent(session.id)}`).catch(() => {});
    setSession(null);
    setOpen(false);
  };

  const disconnect = async () => {
    try {
      await gp("DELETE", "/api/google-photos/connection");
      toast.success("Google Photos disconnected");
      await reloadStatus();
      setStep("connect");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't disconnect");
    }
  };

  const unavailable = status && !status.available;

  const trigger = (
    <Button variant="outline" size={size} onClick={start} disabled={!status || !!unavailable}>
      <Images className="h-4 w-4" />
      {label}
    </Button>
  );

  return (
    <>
      {unavailable ? (
        <T.Provider delayDuration={150}>
          <T.Root>
            <T.Trigger asChild>
              <span tabIndex={0} className="inline-flex rounded-[10px]" aria-label={`${label} — unavailable. ${status.message ?? ""}`}>
                {trigger}
              </span>
            </T.Trigger>
            <T.Portal>
              <T.Content sideOffset={6} className="z-[80] max-w-[280px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-fg shadow-pop">
                {status.message}
              </T.Content>
            </T.Portal>
          </T.Root>
        </T.Provider>
      ) : (
        trigger
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : cancel())}
        title="Import from Google Photos"
        description={target === "photos" ? "Pick photos and videos in Google Photos — they'll be added to your Photo Diary." : "Pick photos and videos in Google Photos — they'll be added to this memory."}
        size="sm"
        footer={
          step === "done" ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : step === "connect" ? (
            <>
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button onClick={() => (window.location.href = connectUrl)}>Connect Google Photos</Button>
            </>
          ) : step === "ready" ? (
            <>
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button onClick={choose}>
                <ExternalLink className="h-4 w-4" /> Choose in Google Photos
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={cancel}>
              {step === "importing" ? "Stop" : "Cancel"}
            </Button>
          )
        }
      >
        <div className="space-y-3 text-[13.5px] text-fg-2" aria-live="polite">
          {note && (
            <p className="flex items-start gap-2 rounded-[10px] bg-danger-soft px-3 py-2 text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{note}</span>
            </p>
          )}
          {step === "connect" && (
            <p>
              MyDiary asks Google only for permission to see the photos you pick — never your whole library. You&apos;ll come back here
              afterwards.
            </p>
          )}
          {step === "ready" && (
            <>
              <p>Google Photos opens in a new tab. Pick what you&apos;d like, tap Done, then come back here — importing starts by itself.</p>
              {status?.connected && (
                <button type="button" onClick={disconnect} className="text-[12.5px] font-medium text-fg-2 underline underline-offset-2 hover:text-fg">
                  Disconnect Google Photos
                </button>
              )}
            </>
          )}
          {step === "picking" && (
            <>
              <p className="flex items-center gap-2 text-fg">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Waiting for you to pick in Google Photos…
              </p>
              {blockedUrl && (
                <p>
                  Your browser blocked the new tab.{" "}
                  <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
                    Open Google Photos
                  </a>
                </p>
              )}
            </>
          )}
          {step === "importing" && (
            <>
              <p className="flex items-center gap-2 text-fg">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Importing {progress.total ? `${progress.done} of ${progress.total}` : "…"}
              </p>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 5} />
              <p className="text-[12.5px]">Keep this page open until it finishes.</p>
            </>
          )}
          {step === "done" && result && (
            <>
              <p className="flex items-center gap-2 text-fg">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {result.imported + result.reused === 0
                  ? "Nothing was imported."
                  : `${result.imported + result.reused} ${result.imported + result.reused === 1 ? "item" : "items"} added${result.reused ? ` (${result.reused} already imported before)` : ""}.`}
              </p>
              {result.failed.length > 0 && (
                <div>
                  <p className="font-medium text-danger">{result.failed.length} couldn&apos;t be imported:</p>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-[12.5px]">
                    {result.failed.map((f) => (
                      <li key={f.id}>
                        <span className="font-medium text-fg">{f.name}</span> — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
