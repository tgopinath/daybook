"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { formatDistanceToNowStrict } from "date-fns";
import type { Notification, NotificationType } from "@prisma/client";
import {
  AlarmClock,
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  Clock,
  Flame,
  Info,
  Settings2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS, type Wire } from "@/lib/client";
import { useTz } from "@/lib/use-me";
import { dayKey, addDaysKey, zonedToUtc } from "@/lib/time";
import { Menu } from "@/components/ui/menu";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

export type WireNotification = Wire<Notification>;
type ListResponse = { items: WireNotification[]; unread: number };

export const NOTIFICATION_META: Record<NotificationType, { icon: LucideIcon; label: string; className: string }> = {
  REMINDER: { icon: AlarmClock, label: "Reminder", className: "bg-primary-soft text-primary" },
  TASK_OVERDUE: { icon: TriangleAlert, label: "Overdue task", className: "bg-danger-soft text-danger" },
  GOAL_MILESTONE: { icon: Trophy, label: "Goal milestone", className: "bg-success-soft text-success" },
  HABIT: { icon: Flame, label: "Habit", className: "bg-warning-soft text-warning-text" },
  CALENDAR: { icon: CalendarClock, label: "Calendar", className: "bg-primary-soft text-primary" },
  AI: { icon: Sparkles, label: "AI recommendation", className: "bg-primary-soft text-primary" },
  SYSTEM: { icon: Info, label: "MyDiary", className: "bg-surface-2 text-fg-2" },
};

const KEY = "/api/notifications?limit=60";

function refreshAll() {
  return refresh("/api/notifications", "/api/reminders", ...SUMMARY_KEYS);
}

/** Tomorrow at 09:00 in the user's timezone. */
function tomorrowMorning(tz: string) {
  return zonedToUtc(addDaysKey(dayKey(new Date(), tz), 1), "09:00", tz);
}

function NotificationItem({ n, tz, onOpen }: { n: WireNotification; tz: string; onOpen: (n: WireNotification) => void }) {
  const meta = NOTIFICATION_META[n.type] ?? NOTIFICATION_META.SYSTEM;
  const Icon = meta.icon;
  const unread = !n.readAt;

  const snooze = async (body: { snoozeMinutes?: number; snoozeUntil?: string }, label: string) => {
    try {
      await api.patch(`/api/notifications/${n.id}`, body);
      toast.success(`Snoozed ${label}`);
      void refreshAll();
    } catch (err) {
      toastError(err);
    }
  };
  const toggleRead = async () => {
    try {
      await api.patch(`/api/notifications/${n.id}`, { read: unread });
      void refreshAll();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <li className="group relative">
      <button
        onClick={() => onOpen(n)}
        className={cn("flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 pr-10 text-left transition-colors hover:bg-surface-2", unread && "bg-primary-soft/40")}
      >
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", meta.className)} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-[13.5px]", unread ? "font-semibold text-fg" : "font-medium text-fg-2")}>{n.title}</span>
            {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-fg-2">{n.body}</span>}
          <span className="mt-1 block text-[11.5px] text-fg-3">
            {meta.label} · {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
          </span>
        </span>
      </button>
      <div className="absolute top-2 right-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <Menu
          trigger={
            <button className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg" aria-label="Notification options">
              <Clock className="h-3.5 w-3.5" />
            </button>
          }
          items={[
            { type: "label", label: "Snooze" },
            { label: "10 minutes", icon: Clock, onSelect: () => snooze({ snoozeMinutes: 10 }, "for 10 minutes") },
            { label: "1 hour", icon: Clock, onSelect: () => snooze({ snoozeMinutes: 60 }, "for 1 hour") },
            { label: "Tomorrow, 9:00", icon: Clock, onSelect: () => snooze({ snoozeUntil: tomorrowMorning(tz).toISOString() }, "until tomorrow") },
            { type: "separator" },
            { label: unread ? "Mark as read" : "Mark as unread", icon: CheckCheck, onSelect: toggleRead },
          ]}
        />
      </div>
    </li>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const tz = useTz();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const { data, error, isLoading } = useApi<ListResponse>(KEY, { refreshInterval: 30_000 });
  const unread = data?.unread ?? 0;

  const groups = useMemo(() => {
    const items = (data?.items ?? []).filter((n) => tab === "all" || !n.readAt);
    const today = dayKey(new Date(), tz);
    const t: WireNotification[] = [];
    const e: WireNotification[] = [];
    for (const n of items) (dayKey(new Date(n.createdAt), tz) === today ? t : e).push(n);
    return [
      { label: "Today", items: t },
      { label: "Earlier", items: e },
    ].filter((g) => g.items.length);
  }, [data, tab, tz]);

  const openItem = async (n: WireNotification) => {
    setOpen(false);
    if (!n.readAt) api.patch(`/api/notifications/${n.id}`, { read: true }).then(() => refreshAll(), () => {});
    if (n.link?.startsWith("/")) router.push(n.link);
  };

  const markAll = async () => {
    try {
      await api.post("/api/notifications/read-all");
      void refreshAll();
    } catch (err) {
      toastError(err);
    }
  };

  const clearAll = async () => {
    setOpen(false);
    const ok = await confirm({
      title: "Clear all notifications?",
      body: "This permanently removes every notification in your notification center, including unread ones. Reminders themselves are not affected.",
      destructive: true,
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    try {
      const res = await api.post<{ count: number }>("/api/notifications/clear", { scope: "all" });
      toast.success(res.count ? `Cleared ${res.count} notification${res.count === 1 ? "" : "s"}` : "Nothing to clear");
      void refreshAll();
    } catch (err) {
      toastError(err);
    }
  };

  const total = data?.items.length ?? 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn("relative flex h-9 w-9 items-center justify-center rounded-[10px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg", open && "bg-surface-2 text-fg")}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-bg tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 flex max-h-[min(560px,calc(100dvh-80px))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-[popIn_.12s_ease-out]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 pt-3 pb-2.5">
            <h2 className="text-[15px] font-semibold">Notifications</h2>
            <div className="flex items-center gap-0.5">
              <button
                onClick={markAll}
                disabled={!unread}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
              <Link
                href="/settings#notifications"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg"
                aria-label="Notification preferences"
                title="Notification preferences"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="px-4 pt-2.5">
            <Segmented
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", count: unread },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2 scroll-thin">
            {isLoading && !data ? (
              <div className="flex flex-col gap-2 px-2.5 py-1">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : error && !data ? (
              <p className="px-4 py-8 text-center text-[13px] text-danger">Couldn&apos;t load notifications. {error instanceof Error ? error.message : ""}</p>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-fg-3">
                  <BellOff className="h-[18px] w-[18px]" />
                </span>
                <p className="text-[13.5px] font-medium">{tab === "unread" ? "You're all caught up" : "No notifications yet"}</p>
                <p className="mt-1 text-[12.5px] text-fg-3">Reminders, overdue tasks, calendar alerts and suggestions show up here.</p>
              </div>
            ) : (
              groups.map((g) => (
                <section key={g.label} className="mb-1">
                  <h3 className="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{g.label}</h3>
                  <ul className="flex flex-col gap-0.5">
                    {g.items.map((n) => (
                      <NotificationItem key={n.id} n={n} tz={tz} onOpen={openItem} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-2">
            <Link href="/reminders" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[12.5px] font-medium text-primary hover:bg-primary-soft">
              Open reminders
            </Link>
            <button
              onClick={clearAll}
              disabled={!total}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-fg-3 hover:bg-danger-soft hover:text-danger disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
