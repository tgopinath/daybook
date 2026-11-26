import {
  LayoutGrid, CheckSquare, Target, CalendarDays, Bell, Repeat, StickyNote, Shield,
  Briefcase, CalendarClock, Zap, BarChart3, Archive, Trash2, Settings, BookOpen, Heart, Smile,
  Images, Mountain, History, Camera, ClipboardCheck, Wallet, Cloud, ShieldCheck, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  action?: "quick-capture";
  shortcut?: string;
  ready?: false;
  /** Extra path prefixes that count as "this item" for the active state. */
  match?: string[];
};
export type NavGroup = { section: string; items: NavItem[]; /** Kept out of the sidebar (still live pages). */ hidden?: true };

/**
 * Pages that live inside My space. They're shown as widgets on /my-space instead of a long menu,
 * but stay reachable at their own URLs (widgets, search, shortcuts, links).
 */
const MY_SPACE_PAGES: NavItem[] = [
  { label: "My Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Reminders", href: "/reminders", icon: Bell },
  { label: "Habits", href: "/habits", icon: Repeat },
  { label: "Notes", href: "/notes", icon: StickyNote },
  { label: "Journal", href: "/journal", icon: BookOpen },
  { label: "Gratitude", href: "/gratitude", icon: Heart },
  { label: "Mood Tracker", href: "/mood", icon: Smile },
  { label: "Memories", href: "/memories", icon: Images },
  { label: "Bucket List", href: "/bucket-list", icon: Mountain },
  { label: "Life Timeline", href: "/timeline", icon: History },
  { label: "Personal Information", href: "/vault", icon: Shield },
  { label: "My Finance", href: "/finance", icon: Wallet },
  { label: "My Storage", href: "/drive", icon: Cloud },
  { label: "My Security", href: "/security", icon: ShieldCheck },
];

const ALL_NAV: NavGroup[] = [
  {
    section: "Workspace",
    items: [
      // The home page (Overview was merged into it; /overview redirects here).
      { label: "My space", href: "/my-space", icon: LayoutGrid, match: ["/overview", ...MY_SPACE_PAGES.map((i) => i.href!)] },
    ],
  },
  { section: "My space", hidden: true, items: MY_SPACE_PAGES },
  {
    section: "Personal Collections",
    items: [
      { label: "Photo Diary", href: "/photos", icon: Camera },
      { label: "My portfolio", href: "/portfolio", icon: Briefcase },
    ],
  },
  {
    section: "Smart Tools",
    items: [
      { label: "Daily Planner", href: "/planner", icon: CalendarClock },
      { label: "Weekly Review", href: "/weekly-review", icon: ClipboardCheck },
      { label: "Quick Capture", icon: Zap, action: "quick-capture", shortcut: "⌘K" },
      { label: "Insights", href: "/insights", icon: BarChart3 },
    ],
  },
  {
    section: "Organization",
    items: [
      { label: "Archived Items", href: "/archive", icon: Archive },
      { label: "Recently Deleted", href: "/trash", icon: Trash2 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/**
 * Every live destination. Pages still being built (`ready: false`) are left out so nothing links to an
 * unfinished page; My space widgets use this to decide what to show.
 */
export const NAV: NavGroup[] = ALL_NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.ready !== false) })).filter((g) => g.items.length > 0);

/** What the sidebar lists: live groups that aren't folded into My space. */
export const SIDEBAR_NAV = NAV.filter((g) => !g.hidden);

const LIVE_HREFS = new Set(NAV.flatMap((g) => g.items.map((i) => i.href).filter((h): h is string => !!h)));
/** True when the page at `href` is live (in the menu config and not `ready: false`). */
export const isLive = (href: string) => LIVE_HREFS.has(href);

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Active state for a nav item, including the pages it stands for (My space → /tasks, /journal…). */
export function isNavActive(item: NavItem, pathname: string) {
  if (!item.href) return false;
  return under(pathname, item.href) || !!item.match?.some((h) => under(pathname, h));
}

/** The My space page the user is on (root page only, e.g. /journal), for the "← My space" link. */
export function mySpacePageAt(pathname: string): NavItem | undefined {
  return MY_SPACE_PAGES.find((i) => i.href === pathname && i.ready !== false);
}

export const MOBILE_NAV: NavItem[] = [
  { label: "My space", href: "/my-space", icon: LayoutGrid, match: MY_SPACE_PAGES.filter((i) => !["/calendar", "/tasks"].includes(i.href!)).map((i) => i.href!) },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Capture", icon: Zap, action: "quick-capture" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
];
