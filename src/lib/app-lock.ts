// App lock: an optional PIN asked after inactivity or on demand. It is a privacy screen for a shared or
// unattended device — it hides what's on screen — not encryption: the session stays signed in underneath.
// Shared by the API (validation) and the overlay (client); no server-only or client-only imports here.

export const LOCK_MINUTE_OPTIONS = [1, 5, 15, 30, 60] as const;
export type LockMinutes = (typeof LOCK_MINUTE_OPTIONS)[number];
export const isLockMinutes = (n: number): n is LockMinutes => (LOCK_MINUTE_OPTIONS as readonly number[]).includes(n);

/** 4–8 digits. */
export const PIN_PATTERN = /^\d{4,8}$/;

/** Wrong PINs allowed per 15 minutes before a full sign-in is required. */
export const LOCK_MAX_ATTEMPTS = 5;
export const LOCK_WINDOW_MS = 15 * 60_000;

/** A session this young may set, change or remove the PIN without the current PIN (it just signed in). */
export const FRESH_SIGN_IN_MS = 10 * 60_000;

/** sessionStorage keys: lock state survives a reload of the tab, and ends with it. */
export const LOCK_STATE_KEY = "pad-app-lock";
export const LOCK_ACTIVE_KEY = "pad-app-lock-active";
export const LOCK_EVENT = "mydiary:app-lock";

/** Locks the app now (handled by the overlay mounted in the app shell). No-op when no PIN is set. */
export function lockNow() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_EVENT));
}

/** Forget this tab's lock state, e.g. after a full sign-in or sign-out. */
export function clearLockState() {
  try {
    sessionStorage.removeItem(LOCK_STATE_KEY);
    sessionStorage.removeItem(LOCK_ACTIVE_KEY);
  } catch {}
}
