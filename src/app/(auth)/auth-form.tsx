"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { api } from "@/lib/client";
import { browserTz } from "@/lib/time";

/** Messages for ?error= codes set by the Google sign-in routes. */
const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet. Use your email and password for now.",
  google_cancelled: "Google sign-in was cancelled.",
  google_expired: "That Google sign-in took too long or was started in another tab. Please try again.",
  google_state: "We couldn't verify that Google sign-in. Please try again.",
  google_unverified: "Your Google account's email address isn't verified, so it can't be used to sign in.",
  google_failed: "Google sign-in didn't work. Please try again.",
  too_many_attempts: "Too many sign-in attempts. Try again in a few minutes.",
  no_database: "Sign-in is unavailable on this preview because it has no database.",
};

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api/") ? next : "/overview";
}

/** Re-enable buttons when the page comes back from the back/forward cache after a redirect. */
function usePageShowReset(reset: () => void) {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && reset();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [reset]);
}

export function AuthForm({ mode, googleEnabled, noDatabase }: { mode: "login" | "signup"; googleEnabled: boolean; noDatabase: boolean }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [withDemo, setWithDemo] = useState(false);
  const [error, setError] = useState<string | null>(() => ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState<null | "email" | "google" | "demo">(null);
  usePageShowReset(() => setBusy(null));
  const expired = params.get("reason") === "expired" && !error;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy("email");
    try {
      if (mode === "signup") await api.post("/api/auth/signup", { ...form, timezone: browserTz(), withDemo });
      else await api.post("/api/auth/login", { email: form.email, password: form.password });
      // Full navigation: starts the app with a clean client cache for this user.
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  function google() {
    if (busy || !googleEnabled) return;
    setError(null);
    setBusy("google");
    window.location.assign(`/api/auth/google?next=${encodeURIComponent(next)}&tz=${encodeURIComponent(browserTz())}`);
  }

  function exploreDemo() {
    if (busy) return;
    setBusy("demo");
    window.location.assign("/api/demo/start");
  }

  const isLogin = mode === "login";

  return (
    <div>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{isLogin ? "Welcome to MyDiary" : "Create your MyDiary account"}</h1>
      <p className="mt-1.5 text-[14.5px] text-fg-2">{isLogin ? "Sign in to organise your day." : "Plan your days, track your goals and keep your notes in one place."}</p>

      {expired && <Notice>Your session has ended. Please sign in again.</Notice>}
      {error && (
        <p role="alert" className="mt-5 rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger">
          {error}
        </p>
      )}

      {noDatabase ? (
        <>
          <Notice>
            This preview runs without a database, so accounts can&apos;t be created or signed in to here. You can still try everything with sample data.
          </Notice>
          <Button size="lg" className="mt-6 w-full justify-center" onClick={exploreDemo} loading={busy === "demo"}>
            Explore the demo <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="mt-7">
            <GoogleButton onClick={google} loading={busy === "google"} disabled={!googleEnabled || (busy !== null && busy !== "google")} />
            {!googleEnabled && <p className="mt-2 text-center text-[12px] text-fg-3">Google sign-in isn&apos;t set up on this server yet.</p>}
          </div>

          <div className="my-6 flex items-center gap-3 text-[12px] text-fg-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            or continue with email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {!isLogin && (
              <Field label="Name">
                <Input className="h-10" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            )}
            <Field label="Email">
              <Input className="h-10" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Password" hint={isLogin ? undefined : "At least 8 characters"}>
              <Input
                className="h-10"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={isLogin ? 1 : 8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            {!isLogin && (
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-fg-2">
                <Checkbox checked={withDemo} onChange={setWithDemo} size={16} className="mt-0.5 rounded-[5px]" label="Add sample data" />
                <span>Add some sample data to start with. It&apos;s labelled <em>Demo</em> and can be removed anytime.</span>
              </label>
            )}
            <Button type="submit" size="lg" loading={busy === "email"} disabled={busy !== null && busy !== "email"} className="mt-1 w-full justify-center">
              {isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-fg-2">
            {isLogin ? (
              <>
                New to MyDiary?{" "}
                <Link href={`/signup${params.toString() ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary hover:underline">
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>

          <div className="mt-8 border-t border-line pt-5 text-center">
            <button
              type="button"
              onClick={exploreDemo}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 text-[13px] text-fg-2 transition-colors hover:text-fg disabled:opacity-60"
            >
              {busy === "demo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Just looking? <span className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">Explore the demo</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-5 flex gap-2 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-fg-2">
      <Info className="mt-px h-4 w-4 shrink-0 text-fg-3" />
      <span>{children}</span>
    </p>
  );
}

/**
 * "Continue with Google" button following Google's sign-in branding guidelines
 * (standard colours, multicolour "G" logo, Roboto-style medium label, 40px height).
 */
function GoogleButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className="gsi-button relative flex h-10 w-full items-center justify-center gap-3 rounded-full border px-3 text-[14px] font-medium tracking-[0.25px] transition-colors disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <GoogleLogo />}
      <span>{loading ? "Connecting to Google…" : "Continue with Google"}</span>
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
