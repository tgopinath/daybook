"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { useMe } from "@/lib/use-me";

/**
 * Browser notification plumbing: registers /sw.js, keeps this device's Web
 * Push subscription in sync with the user's settings, and exposes the real
 * permission state. Nothing here simulates a notification — delivery is the
 * server dispatcher → Web Push → service worker.
 */

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function supported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window && window.isSecureContext;
}

function readPermission(): PermissionState {
  if (!supported()) return "unsupported";
  return Notification.permission as PermissionState;
}

// Tiny store so every component sees permission changes.
const listeners = new Set<() => void>();
let current: PermissionState = "default";
let initialised = false;
function setPermission(p: PermissionState) {
  if (p === current) return;
  current = p;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Why push is or isn't available in this browser, in plain words. */
export function unsupportedReason(): string {
  if (typeof window === "undefined") return "";
  if (!window.isSecureContext) return "Notifications need a secure (HTTPS) connection.";
  if (!("serviceWorker" in navigator)) return "This browser doesn't support service workers, which notifications need.";
  if (!("Notification" in window) || !("PushManager" in window)) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return ios
      ? "On iPhone and iPad, add My Diary to your Home Screen (Share → Add to Home Screen) and open it from there to enable notifications."
      : "This browser doesn't support push notifications.";
  }
  return "";
}

export function useNotificationPermission(): PermissionState {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!initialised) {
        initialised = true;
        current = readPermission();
      }
      return current;
    },
    () => "default",
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registration) {
    registration = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .catch((err) => {
        console.warn("Service worker registration failed", err);
        registration = null;
        return null;
      });
  }
  return registration;
}

/**
 * Makes sure this device has a Web Push subscription stored on the server.
 * Returns a result describing exactly what happened.
 */
export async function ensurePushSubscription(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!supported()) return { ok: false, reason: unsupportedReason() || "Push isn't supported in this browser." };
  if (Notification.permission !== "granted") return { ok: false, reason: "Notification permission hasn't been granted." };
  if (!VAPID) return { ok: false, reason: "Push isn't configured on the server (missing VAPID public key)." };
  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "The service worker couldn't be registered." };
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) });
    await api.post("/api/push/subscribe", sub.toJSON());
    void refresh("/api/push");
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Couldn't subscribe this device to push." };
  }
}

/** Removes this device's push subscription (browser + server). */
export async function removePushSubscription() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  void refresh("/api/push");
}

/**
 * Asks the browser for notification permission (must be called from a user
 * gesture) and subscribes this device to Web Push when granted. Returns the
 * real resulting permission.
 */
export async function requestNotificationPermission(): Promise<{ permission: PermissionState; subscribed: boolean; reason?: string }> {
  if (!supported()) {
    setPermission("unsupported");
    return { permission: "unsupported", subscribed: false, reason: unsupportedReason() };
  }
  let p: NotificationPermission = Notification.permission;
  if (p === "default") p = await Notification.requestPermission();
  setPermission(p as PermissionState);
  if (p !== "granted") return { permission: p as PermissionState, subscribed: false };
  const res = await ensurePushSubscription();
  return res.ok ? { permission: "granted", subscribed: true } : { permission: "granted", subscribed: false, reason: res.reason };
}

export function ReminderRunner() {
  const router = useRouter();
  const { data: me } = useMe();
  const enabled = me?.settings.browserNotifications;

  // Permission state + live changes.
  useEffect(() => {
    setPermission(readPermission());
    if (!supported() || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => setPermission(readPermission());
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {});
    window.addEventListener("focus", onChange);
    return () => {
      status?.removeEventListener("change", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);

  // Service worker + messages from it.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void registerServiceWorker();
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; link?: string } | null;
      if (!msg?.type) return;
      if (msg.type === "daybook:navigate" && msg.link?.startsWith("/")) {
        router.push(msg.link);
        void refresh("/api/notifications");
      } else if (msg.type === "daybook:push" || msg.type === "daybook:refresh") {
        void refresh("/api/reminders", "/api/notifications", ...SUMMARY_KEYS);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  // Keep the push subscription in line with permission + settings.
  const permission = useNotificationPermission();
  useEffect(() => {
    if (enabled === undefined) return;
    if (permission === "granted" && enabled) void ensurePushSubscription();
    else if (permission === "granted" && !enabled) void removePushSubscription();
  }, [permission, enabled]);

  return null;
}
