"use client";
import { formatDistanceToNow, format } from "date-fns";
import { Laptop, MonitorSmartphone, Smartphone, Tablet, HelpCircle } from "lucide-react";
import { api, refresh, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, SkeletonList } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { SecurityCard } from "./security-card";
import type { SessionItem } from "./types";

const ICONS = { desktop: Laptop, mobile: Smartphone, tablet: Tablet, unknown: HelpCircle };

export function SessionsCard({ reviewed, onReviewed }: { reviewed: boolean; onReviewed: () => void }) {
  const { data, error, isLoading } = useApi<{ items: SessionItem[] }>("/api/security/sessions");
  const items = data?.items ?? [];
  const others = items.filter((s) => !s.current).length;

  async function signOutOne(s: SessionItem) {
    try {
      await api.delete(`/api/security/sessions/${s.id}`);
      toast.success(`Signed out ${s.label}`);
      refresh("/api/security");
    } catch (err) {
      toastError(err);
    }
  }

  async function signOutOthers() {
    const ok = await confirm({
      title: "Sign out all other devices?",
      body: `${others} other ${others === 1 ? "device" : "devices"} will need to sign in again. This device stays signed in.`,
      confirmLabel: "Sign out others",
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await api.delete<{ count: number }>("/api/security/sessions");
      toast.success(r.count === 1 ? "Signed out 1 device" : `Signed out ${r.count} devices`);
      refresh("/api/security");
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <SecurityCard
      id="sessions"
      icon={MonitorSmartphone}
      title="Where you're signed in"
      status={data ? <Badge>{items.length}</Badge> : null}
      description="Devices and browsers signed in to your account. Sign out any you don't recognise."
      className="lg:col-span-2"
    >
      {error && !data ? (
        <p className="text-[13px] text-danger">Couldn&apos;t load your devices. {error.message}</p>
      ) : isLoading && !data ? (
        <SkeletonList rows={2} />
      ) : (
        <>
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {items.map((s) => {
              const Icon = ICONS[s.kind];
              return (
                <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                  <Icon className="h-5 w-5 shrink-0 text-fg-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                      <span className="truncate">{s.label}</span>
                      {s.current && <Badge tone="success">This device</Badge>}
                    </div>
                    <p className="mt-0.5 text-[12px] text-fg-3">
                      {s.current ? "Active now" : `Last active ${formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })}`} · Signed in {format(new Date(s.createdAt), "d MMM yyyy")}
                    </p>
                  </div>
                  {!s.current && (
                    <Button variant="ghost" size="sm" onClick={() => signOutOne(s)} aria-label={`Sign out ${s.label}, signed in ${format(new Date(s.createdAt), "d MMM yyyy")}`}>
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {others > 0 && (
              <Button variant="outline" size="sm" onClick={signOutOthers}>
                Sign out all other devices
              </Button>
            )}
            {reviewed ? (
              <span className="text-[12.5px] text-success">Reviewed recently. Thanks for checking.</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={onReviewed}>
                These all look like me
              </Button>
            )}
          </div>
        </>
      )}
    </SecurityCard>
  );
}
