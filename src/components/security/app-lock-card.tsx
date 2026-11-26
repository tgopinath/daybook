"use client";
import { useEffect, useState } from "react";
import { Lock, LockKeyhole } from "lucide-react";
import { api, refresh } from "@/lib/client";
import { LOCK_MINUTE_OPTIONS, lockNow } from "@/lib/app-lock";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge, Kbd } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { SecurityCard } from "./security-card";
import type { SecurityOverview } from "./types";

const REFRESH = ["/api/security", "/api/me"];
const label = (m: number) => (m === 60 ? "1 hour" : `${m} minute${m === 1 ? "" : "s"}`);
const pinInput = (v: string) => v.replace(/\D/g, "").slice(0, 8);

export function AppLockCard({ data }: { data: SecurityOverview }) {
  const { enabled, minutes } = data.appLock;
  const [dialog, setDialog] = useState<null | "set" | "change" | "remove">(null);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent)), []);

  async function changeMinutes(m: number) {
    setSavingMinutes(true);
    try {
      await api.patch("/api/security/lock", { minutes: m });
      toast.success(`Locks after ${label(m)} of inactivity`);
      refresh(...REFRESH);
    } catch (err) {
      toastError(err);
    } finally {
      setSavingMinutes(false);
    }
  }

  return (
    <SecurityCard
      id="app-lock"
      icon={LockKeyhole}
      title="App lock"
      status={enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
      description="Ask for a PIN after a while without activity, or whenever you lock it. Good for a shared or unattended device."
    >
      {data.demo ? (
        <p className="text-[13px] text-fg-2">App lock isn&apos;t available on demo accounts.</p>
      ) : enabled ? (
        <div className="flex flex-col gap-4">
          <Field label="Lock after inactivity">
            <Select value={String(minutes)} disabled={savingMinutes} onChange={(e) => changeMinutes(Number(e.target.value))} className="sm:max-w-[220px]">
              {LOCK_MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={lockNow}>
              <Lock className="h-3.5 w-3.5" aria-hidden /> Lock now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("change")}>
              Change PIN
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog("remove")}>
              Turn off
            </Button>
          </div>
          <p className="flex flex-wrap items-center gap-1 text-[12.5px] text-fg-3">
            Shortcut: <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>{isMac ? "⇧" : "Shift"}</Kbd>
            <Kbd>L</Kbd>
          </p>
        </div>
      ) : (
        <Button size="sm" onClick={() => setDialog("set")}>
          Set a PIN
        </Button>
      )}
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
        App lock is a privacy screen: it hides what&apos;s on screen until the PIN is entered. It doesn&apos;t encrypt your data, and anyone who signs in with your
        password can still open your account.
      </p>
      <PinDialog mode={dialog === "remove" ? null : dialog} minutes={minutes || 5} onClose={() => setDialog(null)} />
      <RemovePinDialog open={dialog === "remove"} onClose={() => setDialog(null)} />
    </SecurityCard>
  );
}

function PinDialog({ mode, minutes, onClose }: { mode: null | "set" | "change"; minutes: number; onClose: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [m, setM] = useState(minutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setCurrentPin("");
    setPin("");
    setConfirmPin("");
    setM(minutes);
    setError(null);
  }, [mode, minutes]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return setError("Use 4 to 8 digits.");
    if (pin !== confirmPin) return setError("The PINs don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/security/lock", { pin, minutes: m, ...(mode === "change" && currentPin ? { currentPin } : {}) });
      toast.success(mode === "change" ? "PIN changed" : "App lock is on");
      refresh(...REFRESH);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!mode}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={mode === "change" ? "Change your PIN" : "Set an app lock PIN"}
      description="4 to 8 digits. Pick one that's not your phone or card PIN."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="pin-form" loading={busy}>
            {mode === "change" ? "Change PIN" : "Turn on"}
          </Button>
        </>
      }
    >
      <form id="pin-form" onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        {mode === "change" && (
          <Field label="Current PIN" hint="Not needed if you signed in within the last 10 minutes.">
            <Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} autoFocus value={currentPin} onChange={(e) => setCurrentPin(pinInput(e.target.value))} />
          </Field>
        )}
        <Field label="New PIN">
          <Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} autoFocus={mode !== "change"} value={pin} onChange={(e) => setPin(pinInput(e.target.value))} />
        </Field>
        <Field label="Confirm PIN">
          <Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={confirmPin} onChange={(e) => setConfirmPin(pinInput(e.target.value))} />
        </Field>
        {mode === "set" && (
          <Field label="Lock after inactivity">
            <Select value={String(m)} onChange={(e) => setM(Number(e.target.value))}>
              {LOCK_MINUTE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {label(o)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </form>
    </Dialog>
  );
}

function RemovePinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentPin("");
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/security/lock/remove", currentPin ? { currentPin } : {});
      toast.success("App lock is off");
      refresh(...REFRESH);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Turn off app lock?"
      description="My Diary won't ask for a PIN on this account anymore."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="pin-remove" variant="danger" loading={busy}>
            Turn off
          </Button>
        </>
      }
    >
      <form id="pin-remove" onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Field label="Current PIN" hint="Forgot it? Sign out and sign in again, then turn it off within 10 minutes.">
          <Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} autoFocus value={currentPin} onChange={(e) => setCurrentPin(pinInput(e.target.value))} />
        </Field>
      </form>
    </Dialog>
  );
}
