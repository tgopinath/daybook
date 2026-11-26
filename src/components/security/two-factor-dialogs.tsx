"use client";
import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { api, refresh } from "@/lib/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { BackupCodesList } from "./backup-codes";

const REFRESH = ["/api/security", "/api/me"];

/** 6-digit code field for authenticator codes (numeric keypad, one-time-code autofill, paste-friendly). */
export function CodeField({ value, onChange, label = "6-digit code", autoFocus = true, id }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => ref.current?.focus());
  }, [autoFocus]);
  return (
    <Field label={label}>
      <Input
        id={id}
        ref={ref}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        className="h-11 font-mono text-[18px] tracking-[0.35em]"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </Field>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] leading-snug text-danger">
      {children}
    </p>
  );
}

const msg = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

type Setup = { qr: string; secret: string; uri: string };

/** Turn on: confirm password → scan QR / enter key → confirm a code → save backup codes. */
export function SetupDialog({ open, onOpenChange, hasPassword }: { open: boolean; onOpenChange: (o: boolean) => void; hasPassword: boolean }) {
  const [step, setStep] = useState<"password" | "scan" | "codes">("password");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [signedOut, setSignedOut] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh state each time it opens; accounts without a password go straight to the QR code.
  useEffect(() => {
    if (!open) return;
    setStep("password");
    setPassword("");
    setSetup(null);
    setCode("");
    setCodes([]);
    setError(null);
    if (!hasPassword) void start();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api.post<Setup>("/api/security/2fa/setup", hasPassword ? { password } : {});
      setSetup(s);
      setPassword("");
      setStep("scan");
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from the app.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ backupCodes: string[]; signedOutOthers: number }>("/api/security/2fa/enable", { code });
      setCodes(r.backupCodes);
      setSignedOut(r.signedOutOthers);
      setSetup(null); // the secret isn't needed (or kept) any longer
      setStep("codes");
      refresh(...REFRESH);
    } catch (err) {
      setError(msg(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret.replace(/\s/g, ""));
      toast.success("Setup key copied");
    } catch {
      toast.error("Couldn't copy. Type the key instead.");
    }
  }

  const close = () => onOpenChange(false);
  const footer =
    step === "password" ? (
      <>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" form="tf-password" loading={busy}>
          Continue
        </Button>
      </>
    ) : step === "scan" ? (
      <>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" form="tf-enable" loading={busy} disabled={!setup}>
          Turn on
        </Button>
      </>
    ) : (
      <Button onClick={close}>I&apos;ve saved my codes</Button>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && step === "codes") toast.success("Two-step verification is on");
        onOpenChange(o);
      }}
      title={step === "codes" ? "Save your backup codes" : "Turn on two-step verification"}
      description={step === "password" ? "First, confirm it's you." : step === "scan" ? "Use an authenticator app on your phone." : "Use one if you ever lose your phone."}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {step === "password" && hasPassword && (
          <form id="tf-password" onSubmit={start} className="flex flex-col gap-4">
            <Field label="Your My Diary password">
              <Input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </form>
        )}
        {step === "password" && !hasPassword && !error && <p className="text-[13.5px] text-fg-2">Preparing your setup key…</p>}

        {step === "scan" && setup && (
          <form id="tf-enable" onSubmit={enable} className="flex flex-col gap-5">
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px] text-fg-2">
              <li>Open your authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
              <li>Add an account and scan this QR code.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {/* QR codes need dark-on-white to scan, in both themes. */}
              <div className="shrink-0 rounded-[12px] border border-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} width={176} height={176} alt="QR code for your authenticator app" className="block h-44 w-44" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg-2">Can&apos;t scan? Enter this key</p>
                <p className="mt-1.5 rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-[13.5px] leading-relaxed tracking-wide break-all text-fg select-all">{setup.secret}</p>
                <Button variant="ghost" size="sm" className="mt-1.5 -ml-2" onClick={copySecret}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy key
                </Button>
                <p className="mt-1 text-[12px] text-fg-3">Time-based, 6 digits, 30 seconds.</p>
              </div>
            </div>
            <CodeField value={code} onChange={setCode} label="Code from the app" />
          </form>
        )}

        {step === "codes" && (
          <>
            <BackupCodesList codes={codes} />
            {signedOut > 0 && (
              <p className="text-[13px] text-fg-2">
                For your safety, {signedOut === 1 ? "1 other device was" : `${signedOut} other devices were`} signed out.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Turn off: password (if the account has one) or a current code. */
export function DisableDialog({ open, onOpenChange, hasPassword }: { open: boolean; onOpenChange: (o: boolean) => void; hasPassword: boolean }) {
  const [useCode, setUseCode] = useState(!hasPassword);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUseCode(!hasPassword);
    setPassword("");
    setCode("");
    setError(null);
  }, [open, hasPassword]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/security/2fa/disable", useCode ? { code } : { password });
      toast.success("Two-step verification is off");
      refresh(...REFRESH);
      onOpenChange(false);
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Turn off two-step verification?"
      description="Signing in will only need your password. Your backup codes will stop working."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="tf-disable" variant="danger" loading={busy}>
            Turn off
          </Button>
        </>
      }
    >
      <form id="tf-disable" onSubmit={submit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {useCode ? (
          <CodeField value={code} onChange={setCode} label="Code from your authenticator app" />
        ) : (
          <Field label="Your password">
            <Input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {hasPassword && (
          <button type="button" onClick={() => setUseCode((v) => !v)} className="self-start text-[13px] font-medium text-primary hover:underline">
            {useCode ? "Use your password instead" : "Use a code from the app instead"}
          </button>
        )}
      </form>
    </Dialog>
  );
}

/** New backup codes (old ones stop working). Needs a current code. */
export function RegenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setCodes(null);
    setError(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from the app.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ backupCodes: string[] }>("/api/security/2fa/backup-codes", { code });
      setCodes(r.backupCodes);
      refresh(...REFRESH);
    } catch (err) {
      setError(msg(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={codes ? "Your new backup codes" : "Get new backup codes"}
      description={codes ? "Your old codes no longer work." : "Your current backup codes will stop working."}
      footer={
        codes ? (
          <Button onClick={() => onOpenChange(false)}>I&apos;ve saved my codes</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="tf-regen" loading={busy}>
              Get new codes
            </Button>
          </>
        )
      }
    >
      {codes ? (
        <BackupCodesList codes={codes} />
      ) : (
        <form id="tf-regen" onSubmit={submit} className="flex flex-col gap-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <CodeField value={code} onChange={setCode} label="Code from your authenticator app" />
        </form>
      )}
    </Dialog>
  );
}
