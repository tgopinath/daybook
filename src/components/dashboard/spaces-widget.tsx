"use client";
import Link from "next/link";
import { BookOpen, CalendarDays, CheckSquare, Cloud, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardData, SpacesStats } from "./types";
import { NAV } from "@/components/layout/nav";

// Cards only for spaces whose page is live (same `ready` flag as the sidebar).
const LIVE = new Set(["/journal", "/calendar", "/tasks", ...NAV.flatMap((g) => g.items.map((i) => i.href))]);

type Space = {
  key: keyof SpacesStats;
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  /** Hue mixed into the card surface (background only, ≈9%). */
  tint: string;
  /** Icon colour classes (tokens / palette tuned for both themes; ≥3:1 on the chip). */
  iconClass: string;
  stat: (s: SpacesStats) => { text: string; tone?: "warning" };
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SPACES: Space[] = [
  {
    key: "diary",
    title: "My Diary",
    subtitle: "Journal & notes",
    href: "/journal",
    icon: BookOpen,
    tint: "var(--success)",
    iconClass: "text-success",
    stat: ({ diary }) => ({ text: diary.entriesThisWeek ? `${plural(diary.entriesThisWeek, "entry", "entries")} this week` : "No entries this week yet" }),
  },
  {
    key: "schedule",
    title: "My Schedule",
    subtitle: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    tint: "#3b82f6",
    iconClass: "text-blue-700 dark:text-blue-300",
    stat: ({ schedule }) => ({ text: schedule.eventsToday ? `${plural(schedule.eventsToday, "event")} today` : "Nothing scheduled today" }),
  },
  {
    key: "finance",
    title: "My Finance",
    subtitle: "Money & budgets",
    href: "/finance",
    icon: Wallet,
    tint: "var(--warning-fill)",
    iconClass: "text-warning",
    stat: ({ finance }) => ({ text: finance.spentThisMonth ? `${finance.label} spent this month` : "No spending logged this month" }),
  },
  {
    key: "tasks",
    title: "My Tasks",
    subtitle: "To-do & goals",
    href: "/tasks",
    icon: CheckSquare,
    tint: "var(--primary)",
    iconClass: "text-primary",
    stat: ({ tasks }) => ({
      text: tasks.dueToday ? `${tasks.dueToday} due today${tasks.overdue ? ` · ${tasks.overdue} overdue` : ""}` : tasks.overdue ? `${tasks.overdue} overdue` : "Nothing due today",
      tone: tasks.overdue ? "warning" : undefined,
    }),
  },
  {
    key: "storage",
    title: "My Storage",
    subtitle: "Files & Drive",
    href: "/drive",
    icon: Cloud,
    tint: "#38bdf8",
    iconClass: "text-sky-700 dark:text-sky-300",
    stat: ({ storage }) => ({
      text: storage.bytesUsed ? `${storage.label} used${storage.files ? ` · ${plural(storage.files, "file")}` : ""}` : "Nothing stored yet",
    }),
  },
  {
    key: "security",
    title: "My Security",
    subtitle: "Vault & sign-in",
    href: "/security",
    icon: ShieldCheck,
    tint: "var(--text-3)",
    iconClass: "text-fg-2",
    stat: ({ security }) => (security.twoFactor ? { text: "2-step sign-in is on" } : { text: "2-step sign-in is off", tone: "warning" }),
  },
];

export function SpacesWidget({ data }: { data: DashboardData }) {
  const stats = data.spaces;
  return (
    <section aria-labelledby="spaces-title">
      <h2 id="spaces-title" className="mb-3 text-[15px] font-semibold text-fg">
        My spaces
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:gap-4 2xl:grid-cols-3">
        {SPACES.filter((s) => LIVE.has(s.href)).map((s) => {
          const stat = stats ? s.stat(stats) : null;
          const Icon = s.icon;
          return (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                className={cn(
                  "group flex h-full min-w-0 items-start gap-2.5 rounded-[14px] border border-line p-3 transition-[box-shadow,border-color] sm:gap-3.5 sm:p-4",
                  "hover:border-line-strong hover:shadow-pop focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none",
                )}
                style={{ background: `color-mix(in oklab, ${s.tint} 9%, var(--surface))` }}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface shadow-card sm:h-11 sm:w-11 sm:rounded-xl", s.iconClass)} aria-hidden>
                  <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={2} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-display truncate text-[15px] leading-tight font-semibold text-fg sm:text-[17px]">{s.title}</span>
                  <span className="mt-0.5 truncate text-[12px] text-fg-2 sm:text-[12.5px]">{s.subtitle}</span>
                  {stat && (
                    <span className={cn("mt-1.5 line-clamp-2 text-[11.5px] leading-snug font-medium sm:mt-2 sm:text-[12.5px]", stat.tone === "warning" ? "text-warning-text" : "text-fg")}>
                      {stat.text}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
