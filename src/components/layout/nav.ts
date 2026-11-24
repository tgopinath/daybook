import {
  LayoutDashboard, CheckSquare, Target, CalendarDays, Bell, Repeat, StickyNote, Shield,
  Sparkles, CalendarClock, Zap, BarChart3, Archive, Trash2, Settings, BookOpen, Heart, Smile,
  Images, Mountain, History, Camera, ClipboardCheck, type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href?: string; icon: LucideIcon; action?: "quick-capture"; shortcut?: string };

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Workspace",
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
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
    ],
  },
  {
    section: "Personal Collections",
    items: [{ label: "Photo Diary", href: "/photos", icon: Camera }],
  },
  {
    section: "Smart Tools",
    items: [
      { label: "AI Assistant", href: "/assistant", icon: Sparkles },
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

export const MOBILE_NAV: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Capture", icon: Zap, action: "quick-capture" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
];
