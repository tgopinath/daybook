"use client";
import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { browserTz } from "./time";

/** Prisma model as it arrives over JSON: Date fields become ISO strings. */
export type Wire<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Timezone sent to the API: the user's saved setting, else the browser's. */
function requestTz() {
  try {
    return localStorage.getItem("pad-tz") || browserTz();
  } catch {
    return browserTz();
  }
}

async function request<T>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "x-tz": requestTz() },
    body: data === undefined ? undefined : JSON.stringify(data),
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) {
    window.location.href = `/login?reason=expired&next=${encodeURIComponent(location.pathname)}`;
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(res.status, json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, data?: unknown) => request<T>("POST", url, data ?? {}),
  patch: <T>(url: string, data: unknown) => request<T>("PATCH", url, data),
  put: <T>(url: string, data: unknown) => request<T>("PUT", url, data),
  delete: <T>(url: string) => request<T>("DELETE", url),
};

export function useApi<T>(url: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(url, (u: string) => api.get<T>(u), { revalidateOnFocus: true, keepPreviousData: true, ...config });
}

/**
 * Revalidate every cached GET whose URL starts with one of the prefixes.
 * Call after a mutation so the dashboard, panels and lists stay in sync,
 * e.g. refresh("/api/tasks", "/api/dashboard").
 */
export function refresh(...prefixes: string[]) {
  const all = prefixes.length === 0;
  return globalMutate((key) => typeof key === "string" && (all || prefixes.some((p) => key.startsWith(p))));
}

/** Everything that summarises across modules. Refresh after any data change. */
export const SUMMARY_KEYS = ["/api/dashboard", "/api/notifications", "/api/ai", "/api/search"];
