"use client";
import { browserTz } from "@/lib/time";

/**
 * Downloads a file from an authenticated API route. The data travels in the
 * response body only (never in a URL), then is saved through a blob link.
 */
export async function downloadFromApi(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: "same-origin", headers: { "x-tz": browserTz() }, cache: "no-store" });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return name;
}
