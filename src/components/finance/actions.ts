"use client";
import { api, HttpError } from "@/lib/client";
import { browserTz } from "@/lib/time";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { refreshFinance } from "./use-finance";
import type { Tx } from "./types";

/** Soft delete with an Undo toast. */
export async function deleteTx(tx: Pick<Tx, "id" | "title">) {
  try {
    await api.delete(`/api/finance/transactions/${tx.id}`);
    await refreshFinance();
    toast.undo("Transaction moved to trash", async () => {
      try {
        await api.patch(`/api/finance/transactions/${tx.id}`, { deletedAt: null });
        await refreshFinance();
        toast.success("Restored");
      } catch (err) {
        toastError(err);
      }
    });
  } catch (err) {
    toastError(err);
  }
}

export async function restoreTx(id: string) {
  try {
    await api.patch(`/api/finance/transactions/${id}`, { deletedAt: null });
    await refreshFinance();
    toast.success("Transaction restored");
  } catch (err) {
    toastError(err);
  }
}

export async function purgeTx(id: string) {
  const ok = await confirm({ title: "Delete forever?", body: "This transaction and a receipt only it uses will be removed permanently. This can't be undone.", destructive: true, confirmLabel: "Delete forever" });
  if (!ok) return false;
  try {
    await api.delete(`/api/finance/transactions/${id}?permanent=1`);
    await refreshFinance();
    toast.success("Deleted permanently");
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

function tz() {
  try {
    return localStorage.getItem("pad-tz") || browserTz();
  } catch {
    return browserTz();
  }
}

/** Authenticated CSV download (fetch + blob, so the session cookie is used and errors are readable). */
export async function downloadCsv(query: string) {
  const res = await fetch(`/api/finance/export.csv${query ? `?${query}` : ""}`, { credentials: "same-origin", headers: { "x-tz": tz() } });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new HttpError(res.status, j?.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "transactions.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const PENDING_KEY = "mydiary-sheets-export";

/**
 * Google Sheets export. Uses fetch directly (not api.*) because a 401 here means "reconnect Google",
 * not "signed out". On { reconnect: true } the range is remembered and the browser goes through the
 * drive.file consent; the finance page resumes the export when it comes back with ?gds=connected.
 */
export async function exportToSheets(range: { from?: string; to?: string }, opts: { returnTo: string; win?: Window | null }) {
  const res = await fetch("/api/google-drive/sheets/export", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-tz": tz() },
    body: JSON.stringify(range),
  });
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string; reconnect?: boolean; rows?: number };
  if (res.status === 401 && j.reconnect) {
    opts.win?.close();
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(range));
    } catch {
      /* storage blocked: the user can press export again */
    }
    toast.info("Connecting to Google so My Diary can create the sheet…");
    window.location.href = `/api/google-drive/sheets/connect?return=${encodeURIComponent(opts.returnTo)}`;
    return null;
  }
  if (!res.ok || !j.url) {
    opts.win?.close();
    throw new HttpError(res.status, j.error ?? `Export failed (${res.status})`);
  }
  const url = j.url;
  if (opts.win && !opts.win.closed) opts.win.location.href = url;
  else toast.success("Your Google Sheet is ready", { action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") }, duration: 15000 });
  return j;
}

/** The export range saved before the Google consent redirect, if any (read once). */
export function takePendingSheetsExport(): { from?: string; to?: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
