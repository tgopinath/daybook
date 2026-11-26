"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Globe, Search, Upload } from "lucide-react";
import { api, refresh } from "@/lib/client";
import { browserTz } from "@/lib/time";
import type { Me } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { cn, initials } from "@/lib/utils";
import { Row, Section, useSaveSettings } from "./shared";

const MAX_UPLOAD = 2 * 1024 * 1024;

/** Center-crops and resizes an image file to a 256px square JPEG data URL. */
async function resizeAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file couldn't be read as an image"));
      i.src = url;
    });
    const size = 256;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser can't process images");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileSection({ me }: { me: Me }) {
  const save = useSaveSettings();
  const [name, setName] = useState(me.user.name);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const hasPassword = me.account?.hasPassword ?? true;
  const isDemoAccount = me.account?.demo ?? false;
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(me.user.name), [me.user.name]);

  const saveProfile = async (patch: { name?: string; avatarUrl?: string | null }) => {
    await api.patch("/api/account/profile", patch);
    await refresh("/api/me");
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file");
    if (file.size > MAX_UPLOAD) return toast.error("Images must be 2 MB or smaller");
    setUploading(true);
    try {
      await saveProfile({ avatarUrl: await resizeAvatar(file) });
      toast.success("Profile picture updated");
    } catch (err) {
      toastError(err);
    } finally {
      setUploading(false);
    }
  };

  const tzBrowser = browserTz();

  return (
    <Section id="profile" title="Profile" description="How you appear in My Diary and how we reach you.">
      <Row label="Profile picture" hint="PNG or JPEG up to 2 MB. We crop it to a square.">
        <div className="flex items-center gap-3">
          {me.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[15px] font-semibold text-primary">{initials(me.user.name) || "?"}</span>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            {!uploading && <Upload className="h-3.5 w-3.5" />} Upload
          </Button>
          {me.user.avatarUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                saveProfile({ avatarUrl: null })
                  .then(() => toast.success("Profile picture removed"))
                  .catch(toastError)
              }
            >
              Remove
            </Button>
          )}
        </div>
      </Row>

      <Row label="Name">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Enter your name");
            setSavingName(true);
            try {
              await saveProfile({ name: name.trim() });
              toast.success("Name updated");
            } catch (err) {
              toastError(err);
            } finally {
              setSavingName(false);
            }
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Name" className="w-full sm:w-[220px]" />
          <Button type="submit" variant="secondary" loading={savingName} disabled={name.trim() === me.user.name || !name.trim()}>
            Save
          </Button>
        </form>
      </Row>

      <Row label="Email" hint={hasPassword ? me.user.email : `${me.user.email} · set a password to change it`}>
        <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)} disabled={!hasPassword || isDemoAccount}>
          Change email
        </Button>
      </Row>

      <Row
        label="Password"
        hint={
          isDemoAccount
            ? "Demo accounts sign in without a password."
            : hasPassword
              ? "Changing it signs you out on other devices."
              : "You sign in with Google. Add a password to also sign in with your email."
        }
      >
        <Button variant="outline" size="sm" onClick={() => setPwOpen(true)} disabled={isDemoAccount}>
          {hasPassword ? "Change password" : "Set password"}
        </Button>
      </Row>

      {me.account?.google && (
        <Row label="Google" hint="You can sign in with Continue with Google.">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success-soft px-2.5 text-[13px] font-medium text-success">Connected</span>
        </Row>
      )}

      <Row
        label="Time zone"
        hint={
          me.settings.timezone !== tzBrowser ? (
            <span>
              Your browser is set to {tzBrowser}.{" "}
              <button className="font-medium text-primary hover:underline" onClick={() => save({ timezone: tzBrowser }).then((ok) => ok && toast.success("Time zone updated"))}>
                Use browser time zone
              </button>
            </span>
          ) : (
            "Matches your browser."
          )
        }
      >
        <TimezonePicker value={me.settings.timezone} onChange={(tz) => save({ timezone: tz }).then((ok) => ok && toast.success("Time zone updated"))} />
      </Row>

      <Row label="Language" hint="More languages are planned.">
        <span className="inline-flex h-9 items-center rounded-[10px] bg-surface-2 px-3 text-sm text-fg-2">English</span>
      </Row>

      <ChangeEmailDialog open={emailOpen} onOpenChange={setEmailOpen} current={me.user.email} />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} hasPassword={hasPassword} />
    </Section>
  );
}

function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {}
  return ["UTC", browserTz()];
}

function TimezonePicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const zones = useMemo(allZones, []);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase().replace(/\s+/g, "_");
    return n ? zones.filter((z) => z.toLowerCase().includes(n)) : zones;
  }, [q, zones]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (tz: string) => {
    setOpen(false);
    setQ("");
    if (tz !== value) onChange(tz);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="flex h-9 w-full items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-left text-sm hover:border-line-strong sm:w-[260px]" aria-label="Time zone">
          <Globe className="h-4 w-4 shrink-0 text-fg-3" />
          <span className="min-w-0 flex-1 truncate">{value.replace(/_/g, " ")}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-[60] w-[min(320px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-1 shadow-pop">
          <div className="relative p-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && filtered[active]) {
                  e.preventDefault();
                  pick(filtered[active]!);
                }
              }}
              placeholder="Search city or region"
              aria-label="Search time zones"
              className="h-8 w-full rounded-lg bg-surface-2 pr-2 pl-8 text-[13px] outline-none placeholder:text-fg-3"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1 scroll-thin">
            {filtered.length === 0 && <p className="px-2 py-3 text-center text-[13px] text-fg-3">No matching time zones</p>}
            {filtered.slice(0, 400).map((z, i) => (
              <button
                key={z}
                data-i={i}
                role="option"
                aria-selected={z === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(z)}
                className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px]", i === active && "bg-surface-2")}
              >
                <span className="flex-1 truncate">{z.replace(/_/g, " ")}</span>
                {z === value && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ChangeEmailDialog({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
    }
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/api/account/email", { email, currentPassword: password });
      await refresh("/api/me");
      toast.success("Email updated");
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Change email"
      description={`Currently ${current}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!email.trim() || !password}>
            Update email
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="New email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Current password" hint="Needed to confirm it's you.">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange, hasPassword }: { open: boolean; onOpenChange: (o: boolean) => void; hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirmPw("");
    }
  }, [open]);
  const mismatch = confirmPw.length > 0 && next !== confirmPw;
  const submit = async () => {
    if (next.length < 8) return toast.error("Use at least 8 characters");
    if (next !== confirmPw) return toast.error("The new passwords don't match");
    setBusy(true);
    try {
      await api.post("/api/account/password", { ...(hasPassword ? { currentPassword: current } : {}), newPassword: next });
      toast.success(hasPassword ? "Password changed. Other devices were signed out." : "Password set. You can now also sign in with your email.");
      void refresh("/api/me");
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={hasPassword ? "Change password" : "Set a password"}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={(hasPassword && !current) || next.length < 8 || next !== confirmPw}>
            {hasPassword ? "Change password" : "Set password"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {hasPassword && (
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? "Passwords don't match" : undefined}>
          <Input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
