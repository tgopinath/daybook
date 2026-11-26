"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Check, ChevronRight, KeyRound, ListChecks, Shield, ShieldCheck, Smartphone } from "lucide-react";
import { useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { SecurityCard } from "./security-card";
import { SessionsCard } from "./sessions-card";
import { AppLockCard } from "./app-lock-card";
import { DisableDialog, RegenerateDialog, SetupDialog } from "./two-factor-dialogs";
import type { SecurityOverview } from "./types";

// "Recent sign-ins reviewed" is remembered per browser for 30 days.
const REVIEW_KEY = "pad-sessions-reviewed";
const REVIEW_DAYS = 30;

function useReviewed() {
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(REVIEW_KEY) || 0);
      setReviewed(Date.now() - at < REVIEW_DAYS * 864e5);
    } catch {}
  }, []);
  const mark = () => {
    try {
      localStorage.setItem(REVIEW_KEY, String(Date.now()));
    } catch {}
    setReviewed(true);
  };
  return [reviewed, mark] as const;
}

export function SecurityView() {
  const { data, error } = useApi<SecurityOverview>("/api/security");
  const [reviewed, markReviewed] = useReviewed();

  return (
    <div>
      <PageHeader title="My Security" description="Your sign-in protections, devices and private information in one place." />
      {error && !data ? (
        <Card className="p-6 text-sm text-danger">Couldn&apos;t load your security settings. {error.message}</Card>
      ) : !data ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-44 lg:col-span-2" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Overview data={data} reviewed={reviewed} />
          <TwoStepCard data={data} />
          <BackupCodesCard data={data} />
          <SessionsCard reviewed={reviewed} onReviewed={markReviewed} />
          <AppLockCard data={data} />
          <VaultCard count={data.vaultCount} />
          <PasswordCard data={data} />
        </div>
      )}
    </div>
  );
}

function Overview({ data, reviewed }: { data: SecurityOverview; reviewed: boolean }) {
  const items = [
    { label: "Password set", done: data.hasPassword, href: "/settings#profile", hint: data.google ? "Optional with Google sign-in" : undefined },
    { label: "Two-step verification on", done: data.twoFactor.enabled, href: "#two-step" },
    { label: "App lock on", done: data.appLock.enabled, href: "#app-lock" },
    { label: "Google account linked", done: data.google, href: undefined, hint: data.google ? undefined : "Sign in with Google once to link it" },
    { label: "Recent sign-ins reviewed", done: reviewed, href: "#sessions" },
  ];
  const done = items.filter((i) => i.done).length;
  const score = Math.round((done / items.length) * 100);
  const verdict = score >= 80 ? "Well protected" : score >= 50 ? "Good, with room to improve" : "Needs attention";
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <Card className="p-5 lg:col-span-2">
      <section aria-labelledby="overview-title" className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 sm:w-[260px] sm:shrink-0">
          <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`Security score ${score} out of 100`}>
            <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden>
              <circle cx="40" cy="40" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              <circle
                cx="40"
                cy="40"
                r={R}
                fill="none"
                stroke={score >= 80 ? "var(--success)" : "var(--primary)"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - score / 100)}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-[24px] font-semibold tabular-nums" aria-hidden>
              {score}
            </span>
          </div>
          <div>
            <h2 id="overview-title" className="text-[15px] font-semibold">
              {verdict}
            </h2>
            <p className="mt-0.5 text-[13px] text-fg-2">
              {done} of {items.length} protections in place
            </p>
          </div>
        </div>
        <ul className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2" aria-label="Security checklist">
          {items.map((i) => {
            const body = (
              <>
                <span
                  className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", i.done ? "bg-success-soft text-success" : "border-[1.5px] border-line-strong")}
                  aria-hidden
                >
                  {i.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={cn("text-[13.5px]", i.done ? "text-fg" : "text-fg-2")}>{i.label}</span>
                  <span className="sr-only">{i.done ? " (done)" : " (not yet)"}</span>
                  {i.hint && !i.done && <span className="block text-[12px] text-fg-3">{i.hint}</span>}
                </span>
              </>
            );
            return (
              <li key={i.label}>
                {i.href && !i.done ? (
                  <a href={i.href} className="-mx-1.5 flex items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-2">
                    {body}
                  </a>
                ) : (
                  <div className="flex items-start gap-2.5 py-1">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}

function TwoStepCard({ data }: { data: SecurityOverview }) {
  const [dialog, setDialog] = useState<null | "setup" | "disable">(null);
  const on = data.twoFactor.enabled;
  return (
    <SecurityCard
      id="two-step"
      icon={ShieldCheck}
      title="Two-step verification"
      status={on ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
      description="When you sign in with your email and password, My Diary also asks for a 6-digit code from an authenticator app on your phone."
    >
      {data.demo ? (
        <p className="text-[13px] text-fg-2">Two-step verification isn&apos;t available on demo accounts.</p>
      ) : on ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-[13px] text-fg-2">
            <Smartphone className="h-4 w-4 text-fg-3" aria-hidden />
            Turned on {data.twoFactor.enabledAt ? format(new Date(data.twoFactor.enabledAt), "d MMM yyyy") : ""}
          </p>
          <div>
            <Button size="sm" variant="ghost" onClick={() => setDialog("disable")}>
              Turn off
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => setDialog("setup")}>
          Turn on
        </Button>
      )}
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
        Signing in with Google uses your Google account&apos;s security, so My Diary doesn&apos;t ask for a code there.
        {!data.hasPassword && data.google ? " Your account doesn't have a password yet, so this protects password sign-in if you add one later." : ""}
      </p>
      <SetupDialog open={dialog === "setup"} onOpenChange={(o) => setDialog(o ? "setup" : null)} hasPassword={data.hasPassword} />
      <DisableDialog open={dialog === "disable"} onOpenChange={(o) => setDialog(o ? "disable" : null)} hasPassword={data.hasPassword} />
    </SecurityCard>
  );
}

function BackupCodesCard({ data }: { data: SecurityOverview }) {
  const [open, setOpen] = useState(false);
  const on = data.twoFactor.enabled;
  const left = data.backupCodes.remaining;
  return (
    <SecurityCard
      icon={ListChecks}
      title="Backup codes"
      status={on ? <Badge tone={left <= 2 ? "warning" : "neutral"}>{left} left</Badge> : null}
      description="Single-use codes for signing in if you lose your phone. Keep them somewhere safe, like a password manager."
    >
      {on ? (
        <div className="flex flex-col gap-3">
          {left <= 2 && <p className="text-[13px] text-warning-text">{left === 0 ? "You've used all your backup codes." : "You're running low on backup codes."} Get a new set.</p>}
          <div>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Get new codes
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-fg-2">You&apos;ll get 10 backup codes when you turn on two-step verification.</p>
      )}
      <RegenerateDialog open={open} onOpenChange={setOpen} />
    </SecurityCard>
  );
}

function VaultCard({ count }: { count: number }) {
  return (
    <SecurityCard
      icon={Shield}
      title="Personal Information"
      status={<Badge>{count === 1 ? "1 item" : `${count} items`}</Badge>}
      description="Your vault for details like emergency contacts, documents and insurance. Fields are encrypted at rest."
    >
      <Link href="/vault" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-primary hover:underline">
        Open Personal Information <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </SecurityCard>
  );
}

function PasswordCard({ data }: { data: SecurityOverview }) {
  return (
    <SecurityCard
      icon={KeyRound}
      title="Password"
      status={data.hasPassword ? <Badge tone="success">Set</Badge> : <Badge>Not set</Badge>}
      description={
        data.hasPassword
          ? "Use a long, unique password. Changing it signs out your other devices."
          : data.google
            ? "You sign in with Google. You can add a password to sign in with your email too."
            : "Add a password to sign in with your email."
      }
    >
      {data.demo ? (
        <p className="text-[13px] text-fg-2">Demo accounts don&apos;t have a password.</p>
      ) : (
        <Link href="/settings#profile" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-primary hover:underline">
          {data.hasPassword ? "Change password" : "Add a password"} in Settings <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </SecurityCard>
  );
}
