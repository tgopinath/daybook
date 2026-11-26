"use client";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AppWindow, Bell, BookOpen, Briefcase, CalendarDays, CheckSquare, Heart, History, Images, Mountain, Repeat, Smile, StickyNote, Target, Upload, Wallet, Zap,
  type LucideIcon,
} from "lucide-react";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { openEventDialog } from "@/components/calendar/event-dialog";
import { openTxDialog } from "@/components/finance/transaction-dialog";
import { openQuickCapture } from "@/lib/ui-store";
import { dispatchCreate } from "@/lib/use-create-param";
import { isLive } from "./nav";

/** Pages that mount the transaction dialog themselves, so "Expense / income" can open it in place. */
const TX_HOSTS = ["/finance", "/my-space"];

type Entry = {
  label: string;
  icon: LucideIcon;
  /** The page this needs (hidden while that page isn't live). */
  page?: string;
  shortcut?: string;
  /** In-app deep link to the page's create form. */
  href?: string;
  /** The page reads its param with useCreateParam: when it's already open, ask it directly instead of navigating. */
  inPlace?: boolean;
  run?: () => void;
};

/**
 * The global "New" menu: create anything from anywhere. Shared by the sidebar (expanded, collapsed,
 * mobile drawer) and the top bar's "Add" button. Radix dropdown: arrow keys, Enter, Esc, type-ahead.
 */
export function CreateMenu({ trigger, align = "start", onNavigate }: { trigger: ReactNode; align?: "start" | "end"; onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  const go = (href: string, inPlace?: boolean) => {
    const url = new URL(href, window.location.origin);
    if (inPlace && url.pathname === pathname) url.searchParams.forEach((value, param) => dispatchCreate(url.pathname, param, value));
    else router.push(href);
  };

  const entries: Entry[] = [
    { label: "Task", icon: CheckSquare, shortcut: "N", run: () => openTaskDialog() },
    { label: "Journal entry", icon: BookOpen, page: "/journal", href: "/journal?new=1" },
    { label: "Note", icon: StickyNote, page: "/notes", href: "/notes?new=1" },
    { label: "Event", icon: CalendarDays, page: "/calendar", run: () => openEventDialog({}) },
    { label: "Reminder", icon: Bell, page: "/reminders", href: "/reminders?new=1", inPlace: true },
    { label: "Goal", icon: Target, page: "/goals", href: "/goals?new=1", inPlace: true },
    { label: "Habit", icon: Repeat, page: "/habits", href: "/habits?new=1", inPlace: true },
    { label: "Memory", icon: Images, page: "/memories", href: "/memories?new=1", inPlace: true },
    { label: "Bucket list item", icon: Mountain, page: "/bucket-list", href: "/bucket-list?new=1" },
    { label: "Timeline moment", icon: History, page: "/timeline", href: "/timeline?new=1" },
    {
      label: "Expense / income",
      icon: Wallet,
      page: "/finance",
      run: () => (TX_HOSTS.includes(pathname) ? openTxDialog({ preset: { type: "expense" } }) : go("/finance?add=expense")),
    },
    { label: "Upload a file", icon: Upload, page: "/drive", href: "/drive?upload=1", inPlace: true },
    { label: "Mood check-in", icon: Smile, page: "/mood", href: "/mood" },
    { label: "Gratitude", icon: Heart, page: "/gratitude", href: "/gratitude" },
    { label: "App link", icon: AppWindow, page: "/apps", href: "/apps?new=1" },
  ];

  const items: MenuItem[] = [
    { type: "label", label: "Create" },
    ...entries
      .filter((e) => !e.page || isLive(e.page))
      .map<MenuItem>((e) => ({
        label: e.label,
        icon: e.icon,
        shortcut: e.shortcut,
        onSelect: () => {
          if (e.run) e.run();
          else if (e.href) go(e.href, e.inPlace);
          onNavigate?.();
        },
      })),
    { type: "separator" },
    {
      label: "Quick capture…",
      icon: Zap,
      shortcut: "⌘K",
      onSelect: () => {
        openQuickCapture();
        onNavigate?.();
      },
    },
  ];

  return <Menu trigger={trigger} items={items} align={align} className="max-h-[min(72vh,600px)] min-w-[232px] overflow-y-auto scroll-thin" />;
}
