"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { api } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOCK_ACTIVE_KEY, LOCK_EVENT, LOCK_STATE_KEY, clearLockState } from "@/lib/app-lock";
import type { MeWithSecurity } from "./types";

const read = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {}
};

/**
 * App lock: after N idle minutes, on ⌘⇧L / Ctrl+Shift+L, or from "Lock now", covers the app and asks for the PIN.
 * The lock state lives in sessionStorage so a reload of the tab stays locked.
 * It's a privacy screen for a shared or unattended device, not encryption.
 */
export function AppLockOverlay() {
  const { data } = useMe();
  const me = data as MeWithSecurity | undefined;
  const minutes = me?.appLock ?? 0;
  const known = !!me;
  const enabled = minutes > 0;
  const [locked, setLocked] = useState(false);
  const [mounted, setMounted] = useState(false);

  const lock = useCallback(() => {
    write(LOCK_STATE_KEY, "1");
    setLocked(true);
  }, []);

  // Restore a lock from this tab (reload while locked) before the account loads.
  useEffect(() => {
    setMounted(true);
    if (read(LOCK_STATE_KEY) === "1") setLocked(true);
  }, []);

  // PIN removed (or never set): nothing to lock.
  useEffect(() => {
    if (known && !enabled) {
      clearLockState();
      setLocked(false);
    }
  }, [known, enabled]);

  // Inactivity timer, shortcut and "Lock now".
  useEffect(() => {
    if (!enabled) return;
    const limit = minutes * 60_000;
    const last = Number(read(LOCK_ACTIVE_KEY) || 0);
    if (last && Date.now() - last > limit) lock();
    else write(LOCK_ACTIVE_KEY, String(Date.now()));

    let lastWrite = 0;
    const activity = () => {
      if (read(LOCK_STATE_KEY) === "1") return;
      const now = Date.now();
      if (now - lastWrite > 5000) {
        lastWrite = now;
        write(LOCK_ACTIVE_KEY, String(now));
      }
    };
    const check = () => {
      if (read(LOCK_STATE_KEY) === "1") return;
      const at = Number(read(LOCK_ACTIVE_KEY) || Date.now());
      if (Date.now() - at > limit) lock();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, activity, { passive: true, capture: true }));
    window.addEventListener("keydown", onKey);
    window.addEventListener(LOCK_EVENT, lock);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 10_000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, activity, { capture: true }));
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(LOCK_EVENT, lock);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [enabled, minutes, lock]);

  if (!mounted || !locked) return null;
  return createPortal(
    <LockScreen
      name={me?.user.name}
      email={me?.user.email}
      onUnlocked={() => {
        write(LOCK_ACTIVE_KEY, String(Date.now()));
        try {
          sessionStorage.removeItem(LOCK_STATE_KEY);
        } catch {}
        setLocked(false);
      }}
    />,
    document.body,
  );
}

function LockScreen({ name, email, onUnlocked }: { name?: string; email?: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Everything behind the lock screen is hidden from keyboard and screen readers while locked.
  useEffect(() => {
    const host = rootRef.current;
    const others = Array.from(document.body.children).filter((el) => el !== host && !el.hasAttribute("inert")) as HTMLElement[];
    others.forEach((el) => el.setAttribute("inert", ""));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      others.forEach((el) => el.removeAttribute("inert"));
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4,8}$/.test(pin)) {
      setError("Enter your 4 to 8 digit PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/security/lock/verify", { pin });
      onUnlocked();
    } catch (err) {
      // After too many wrong PINs the server signs this session out and the client goes to the sign-in page.
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPin("");
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function signOut() {
    setLeaving(true);
    try {
      await api.post("/api/auth/logout");
    } catch {}
    clearLockState();
    window.location.assign("/login");
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-title"
      aria-describedby="app-lock-desc"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-bg px-4 py-10"
    >
      <div className="w-full max-w-[360px] text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <h1 id="app-lock-title" className="font-display text-[26px] leading-tight font-semibold">
          MyDiary is locked
        </h1>
        <p id="app-lock-desc" className="mt-1.5 text-[14px] text-fg-2">
          {name ? `Welcome back, ${name.split(" ")[0]}. ` : ""}Enter your PIN to continue.
        </p>
        {email && <p className="mt-1 text-[12.5px] text-fg-3">{email}</p>}

        <form onSubmit={unlock} className="mt-6 flex flex-col gap-3">
          <label htmlFor="app-lock-pin" className="sr-only">
            PIN
          </label>
          <Input
            id="app-lock-pin"
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            placeholder="PIN"
            aria-invalid={!!error}
            aria-describedby={error ? "app-lock-error" : undefined}
            className="h-12 text-center font-mono text-[22px] tracking-[0.4em]"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
          {error && (
            <p id="app-lock-error" role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] leading-snug text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" loading={busy} className="w-full justify-center">
            Unlock
          </Button>
        </form>

        <button type="button" onClick={signOut} disabled={leaving} className="mt-5 text-[13px] font-medium text-primary hover:underline disabled:cursor-wait">
          {leaving ? "Signing out…" : "Forgot your PIN? Sign out"}
        </button>
        <p className="mt-8 text-[12px] leading-relaxed text-fg-3">
          App lock hides your screen on a shared or unattended device. It doesn&apos;t encrypt your data.
        </p>
      </div>
    </div>
  );
}
