"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, Send, ShieldAlert } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { requestNotificationPermission, unsupportedReason, useNotificationPermission } from "@/components/notifications/reminder-runner";
import { cn } from "@/lib/utils";

function Shell({ tone, icon: Icon, title, children, action }: { tone: "primary" | "warning" | "neutral" | "success"; icon: typeof BellRing; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const tones = {
    primary: "border-primary/25 bg-primary-soft/50",
    warning: "border-warning/30 bg-warning-soft/60",
    neutral: "border-line bg-surface-2/60",
    success: "border-line bg-surface",
  };
  const iconTones = { primary: "text-primary", warning: "text-[#b9781a] dark:text-warning", neutral: "text-fg-3", success: "text-success" };
  return (
    <div className={cn("mb-5 flex flex-col gap-3 rounded-[14px] border px-4 py-3 sm:flex-row sm:items-center", tones[tone])} role="status">
      <Icon className={cn("hidden h-5 w-5 shrink-0 sm:block", iconTones[tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold">{title}</p>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-fg-2">{children}</div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** Real browser notification state for this device, with the matching action. */
export function PermissionBanner() {
  const router = useRouter();
  const permission = useNotificationPermission();
  const { data: me } = useMe();
  const { data: push, mutate } = useApi<{ devices: number; configured: boolean }>("/api/push/subscribe");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const res = await requestNotificationPermission();
      if (res.permission === "granted" && res.subscribed) toast.success("Notifications enabled on this device");
      else if (res.permission === "granted") toast.error(res.reason ?? "Permission granted, but this device couldn't subscribe to push.");
      else if (res.permission === "denied") toast.error("Notifications are blocked for this site.");
      await mutate();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await api.post<{ sent: number }>("/api/push/test");
      toast.success(`Test notification sent to ${res.sent} device${res.sent === 1 ? "" : "s"}`);
    } catch (err) {
      toastError(err);
    } finally {
      setTesting(false);
    }
  };

  if (push && !push.configured) {
    return (
      <Shell tone="neutral" icon={BellOff} title="Push notifications aren't configured on the server">
        Reminders still appear in the notification center. To get system notifications, set the VAPID keys on the server.
      </Shell>
    );
  }

  if (permission === "unsupported") {
    return (
      <Shell tone="neutral" icon={BellOff} title="This browser can't show MyDiary notifications">
        {unsupportedReason() || "Push notifications aren't supported here."} Reminders still appear in the notification center while MyDiary is open.
      </Shell>
    );
  }

  if (permission === "denied") {
    return (
      <Shell tone="warning" icon={ShieldAlert} title="Notifications are blocked for this site">
        Your browser is blocking MyDiary&apos;s notifications. To turn them back on, click the lock or site-settings icon next to the address bar, set
        <strong className="font-medium text-fg"> Notifications</strong> to <strong className="font-medium text-fg">Allow</strong>, then reload this page. On
        macOS, also check System Settings → Notifications for your browser.
      </Shell>
    );
  }

  if (permission === "default") {
    return (
      <Shell
        tone="primary"
        icon={BellRing}
        title="Get reminders even when MyDiary is closed"
        action={
          <Button size="sm" onClick={enable} loading={busy}>
            Enable notifications
          </Button>
        }
      >
        Your browser will ask for permission. Reminders always show in the notification center too.
      </Shell>
    );
  }

  // granted
  if (me && !me.settings.browserNotifications) {
    return (
      <Shell
        tone="neutral"
        icon={BellOff}
        title="Browser notifications are turned off in your preferences"
        action={
          <Button size="sm" variant="outline" onClick={() => router.push("/settings#notifications")}>
            Open preferences
          </Button>
        }
      >
        This browser allows notifications, but MyDiary won&apos;t push to your devices until you turn them back on.
      </Shell>
    );
  }

  const devices = push?.devices ?? 0;
  return (
    <Shell
      tone="success"
      icon={BellRing}
      title="Notifications are on"
      action={
        <>
          {devices === 0 && (
            <Button size="sm" variant="outline" onClick={enable} loading={busy}>
              Reconnect this device
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={test} loading={testing} disabled={devices === 0}>
            <Send className="h-3.5 w-3.5" /> Send test notification
          </Button>
        </>
      }
    >
      {push ? (devices ? `Delivering to ${devices} device${devices === 1 ? "" : "s"}.` : "This device isn't subscribed yet.") : "Checking devices…"}
    </Shell>
  );
}
