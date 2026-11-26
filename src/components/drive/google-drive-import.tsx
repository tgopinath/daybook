"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as T from "@radix-ui/react-tooltip";
import { AlertCircle, CheckCircle2, CloudDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useApi } from "@/lib/client";
import { browserTz } from "@/lib/time";

type Status = { available: boolean; reason: string | null; message: string | null; connected: boolean; expiresAt: string | null; appId: string | null };
type ImportResult = { total: number; imported: number; skipped: number; restored: number; failed: { id: string; name: string; error: string }[]; remaining: number; done: boolean };

// Minimal typings for the parts of gapi / Google Picker we use.
type PickerDoc = { id: string; name?: string };
type PickerData = { action: string; docs?: PickerDoc[] };
type PickerBuilder = {
  addView(v: unknown): PickerBuilder;
  enableFeature(f: string): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOrigin(o: string): PickerBuilder;
  setTitle(t: string): PickerBuilder;
  setMaxItems(n: number): PickerBuilder;
  setCallback(cb: (d: PickerData) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void; dispose(): void };
};
type GooglePickerNs = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMode(m: string): unknown };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
  Action: { PICKED: string; CANCEL: string };
  DocsViewMode: { LIST: string };
};
declare global {
  interface Window {
    gapi?: { load(name: string, opts: { callback: () => void; onerror?: () => void }): void };
    google?: { picker?: GooglePickerNs };
  }
}

let pickerLoad: Promise<GooglePickerNs> | null = null;
function loadPicker(): Promise<GooglePickerNs> {
  if (window.google?.picker) return Promise.resolve(window.google.picker);
  pickerLoad ??= new Promise<GooglePickerNs>((resolve, reject) => {
    const done = () =>
      window.gapi!.load("picker", {
        callback: () => (window.google?.picker ? resolve(window.google.picker) : reject(new Error("Google Picker didn't load"))),
        onerror: () => reject(new Error("Google Picker didn't load")),
      });
    if (window.gapi) return done();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error("Couldn't load Google Picker. Check your connection or content blockers."));
    document.head.appendChild(s);
  }).catch((err) => {
    pickerLoad = null;
    throw err;
  });
  return pickerLoad;
}

class GdError extends Error {
  constructor(
    message: string,
    public reconnect = false,
  ) {
    super(message);
  }
}

/** Like api.* but a 401 { reconnect } means "connect Google Drive again" rather than "signed out". */
async function gd<T>(method: string, url: string, data?: unknown): Promise<T> {
  let tz = "UTC";
  try {
    tz = localStorage.getItem("pad-tz") || browserTz();
  } catch {
    tz = browserTz();
  }
  const res = await fetch(url, { method, headers: { "content-type": "application/json", "x-tz": tz }, body: data === undefined ? undefined : JSON.stringify(data), credentials: "same-origin", cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { error?: string; reconnect?: boolean } | null;
  if (res.status === 401 && !json?.reconnect) window.location.href = `/login?reason=expired&next=${encodeURIComponent(location.pathname)}`;
  if (!res.ok) throw new GdError(json?.error ?? `Request failed (${res.status})`, !!json?.reconnect);
  return json as T;
}

const RETURN_MESSAGES: Record<string, string> = {
  cancelled: "Google Drive wasn't connected — access was cancelled.",
  denied: "Google Drive access wasn't granted, so nothing can be imported.",
  expired: "That connection attempt expired. Please try again.",
  error: "Couldn't connect Google Drive. Please try again.",
  demo: "Importing from Google Drive isn't available in the demo.",
  not_configured: "Google Drive import isn't set up on this server yet.",
  no_storage: "File storage isn't set up on this server yet.",
  no_encryption: "Google Drive import isn't fully set up on this server yet.",
};

type Step = "connect" | "ready" | "picking" | "importing" | "done";

/**
 * "Import from Google Drive": connect (drive.file OAuth) → pick in the Google Picker → import in batches
 * into the folder that's open (`folderId`).
 */
export function GoogleDriveImport({ folderId, onImported, compact }: { folderId: string | null; onImported: () => void; compact?: boolean }) {
  const { data: status, mutate: reloadStatus } = useApi<Status>("/api/google-drive/status");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("ready");
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ imported: number; skipped: number; failed: ImportResult["failed"] } | null>(null);
  const cancelled = useRef(false);
  const target = useRef<string | null>(folderId);
  target.current = folderId;

  // Back from Google's consent screen: /drive?gd=connected
  useEffect(() => {
    const url = new URL(window.location.href);
    const p = url.searchParams.get("gd");
    if (!p) return;
    url.searchParams.delete("gd");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (p === "connected") {
      toast.success("Google Drive connected");
      void reloadStatus();
      setNote(null);
      setResult(null);
      setStep("ready");
      setOpen(true);
    } else toast.error(RETURN_MESSAGES[p] ?? RETURN_MESSAGES.error!);
  }, [reloadStatus]);

  const connect = () => {
    const returnPath = location.pathname + (target.current ? `?folder=${encodeURIComponent(target.current)}` : "");
    window.location.href = `/api/google-drive/connect?return=${encodeURIComponent(returnPath)}`;
  };

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof GdError && err.reconnect) {
        setStep("connect");
        setNote(err.message);
        void reloadStatus();
        return;
      }
      setNote(err instanceof Error ? err.message : "Something went wrong");
      setStep((s) => (s === "importing" ? "done" : "ready"));
    },
    [reloadStatus],
  );

  const runImport = useCallback(
    async (ids: string[]) => {
      setStep("importing");
      setProgress({ done: 0, total: ids.length });
      const skipIds: string[] = [];
      const failed: ImportResult["failed"] = [];
      let imported = 0;
      let skipped = 0;
      try {
        for (let i = 0; i < 60 && !cancelled.current; i++) {
          const r = await gd<ImportResult>("POST", "/api/google-drive/import", { fileIds: ids, folderId: target.current, skipIds });
          imported += r.imported;
          skipped = r.skipped;
          for (const f of r.failed) {
            failed.push(f);
            skipIds.push(f.id);
          }
          setProgress({ done: r.total - r.remaining, total: r.total });
          if (r.imported) onImported();
          if (r.done) break;
        }
        setResult({ imported, skipped, failed });
        setStep("done");
        onImported();
      } catch (err) {
        setResult({ imported, skipped, failed });
        onImported();
        fail(err);
      }
    },
    [fail, onImported],
  );

  const choose = async () => {
    cancelled.current = false;
    setNote(null);
    setResult(null);
    const key = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
    if (!key || !status?.appId) return setNote("Google Drive import isn't fully set up on this server yet.");
    try {
      setStep("picking");
      const [{ accessToken }, picker] = await Promise.all([gd<{ accessToken: string }>("GET", "/api/google-drive/token"), loadPicker()]);
      const view = new picker.DocsView();
      view.setIncludeFolders(false);
      view.setSelectFolderEnabled(false);
      const ids = await new Promise<string[] | null>((resolve) => {
        const p = new picker.PickerBuilder()
          .addView(view)
          .enableFeature(picker.Feature.MULTISELECT_ENABLED)
          .enableFeature(picker.Feature.SUPPORT_DRIVES)
          .setOAuthToken(accessToken)
          .setDeveloperKey(key)
          .setAppId(status.appId!)
          .setOrigin(window.location.origin)
          .setTitle("Choose files to import into My Storage")
          .setMaxItems(100)
          .setCallback((d) => {
            if (d.action === picker.Action.PICKED) resolve((d.docs ?? []).map((x) => x.id));
            else if (d.action === picker.Action.CANCEL) resolve(null);
          })
          .build();
        p.setVisible(true);
      });
      if (!ids?.length) {
        setStep("ready");
        return;
      }
      await runImport(ids);
    } catch (err) {
      fail(err);
    }
  };

  const start = () => {
    cancelled.current = false;
    setResult(null);
    setNote(null);
    setStep(status?.connected ? "ready" : "connect");
    setOpen(true);
  };

  const close = () => {
    cancelled.current = true;
    setOpen(false);
  };

  const disconnect = async () => {
    try {
      await gd("DELETE", "/api/google-drive/connection");
      toast.success("Google Drive disconnected");
      await reloadStatus();
      setStep("connect");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't disconnect");
    }
  };

  const unavailable = status && !status.available;
  const label = compact ? "Google Drive" : "Import from Google Drive";
  const trigger = (
    <Button variant="outline" onClick={start} disabled={!status || !!unavailable} aria-label="Import from Google Drive">
      <CloudDownload className="h-4 w-4" />
      {label}
    </Button>
  );

  return (
    <>
      {unavailable ? (
        <T.Provider delayDuration={150}>
          <T.Root>
            <T.Trigger asChild>
              <span tabIndex={0} className="inline-flex rounded-[10px]" aria-label={`Import from Google Drive — unavailable. ${status.message ?? ""}`}>
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
        open={open && step !== "picking"}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title="Import from Google Drive"
        description="Pick files in Google Drive — copies are saved privately in My Storage."
        size="sm"
        footer={
          step === "done" ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : step === "connect" ? (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={connect}>Connect Google Drive</Button>
            </>
          ) : step === "ready" ? (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={() => void choose()}>Choose files</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={close}>
              Stop
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
          {step === "connect" && <p>My Diary asks Google only for the files you pick — it can&apos;t see the rest of your Drive. You&apos;ll come back here afterwards.</p>}
          {step === "ready" && (
            <>
              <p>Google Docs, Sheets and Slides are saved as Word, Excel and PowerPoint files. Files you&apos;ve imported before are skipped.</p>
              {status?.connected && (
                <button type="button" onClick={() => void disconnect()} className="text-[12.5px] font-medium text-fg-2 underline underline-offset-2 hover:text-fg">
                  Disconnect Google Drive
                </button>
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
                {result.imported ? `Imported ${result.imported} ${result.imported === 1 ? "file" : "files"}.` : "Nothing new to import."}
                {result.skipped ? ` ${result.skipped} already in My Storage.` : ""}
              </p>
              {result.failed.length > 0 && (
                <div>
                  <p className="font-medium text-fg">Couldn&apos;t import:</p>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-[12.5px] scroll-thin">
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
