"use client";

/**
 * Native looks inside the phone apps, from the shared Kolam kits (loaded in app/layout.tsx):
 * - Android app (Capacitor shell, or ?app=android): Material Design 3 top app bar + navigation bar (KolamM3).
 * - iPhone app (MyDiary-iOS or legacy Daybook-iOS shell, or ?app=ios): Apple HIG navigation bar + tab bar (KolamIOS).
 * In a normal browser both kits stay off and the website keeps its own look.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ui, openQuickCapture, openSearch, toggleAIPanel } from "@/lib/ui-store";
import { NAV } from "./nav";

type Kit = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    KolamM3?: Kit;
    KolamIOS?: Kit;
  }
}

const TABS = [
  { id: "overview", href: "/overview", label: "Overview", m3: "dashboard", ios: "square.grid.2x2" },
  { id: "tasks", href: "/tasks", label: "Tasks", m3: "task_alt", ios: "checkmark" },
  { id: "calendar", href: "/calendar", label: "Calendar", m3: "calendar_month", ios: "calendar" },
  { id: "habits", href: "/habits", label: "Habits", m3: "repeat", ios: "arrow.clockwise" },
];
const openMore = () => ui.set({ mobileNavOpen: true });
const tabOf = (path: string) => TABS.find((t) => path.startsWith(t.href))?.id;
const titleOf = (path: string) => {
  for (const s of NAV) for (const i of s.items) if (i.href && path.startsWith(i.href)) return i.label;
  return "MyDiary";
};
/** MyDiary marks dark mode with html.dark; the kits read data-theme. */
function mirrorTheme() {
  const html = document.documentElement;
  const sync = () => html.setAttribute("data-theme", html.classList.contains("dark") ? "dark" : "light");
  sync();
  const mo = new MutationObserver(sync);
  mo.observe(html, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

export function NativeLooks() {
  const router = useRouter();
  const path = usePathname();
  const mode = useRef<"android" | "ios" | null>(null);
  const m3 = useRef<Kit | null>(null);

  useEffect(() => {
    const go = (href: string) => router.push(href);
    const ios = window.KolamIOS?.init({
      appName: "MyDiary",
      uaTokens: ["MyDiary-iOS", "Daybook-iOS"],
      tint: { light: "#993399", dark: "#C77DC7" },
      tabs: [
        ...TABS.map((t) => ({ id: t.id, label: t.label, icon: t.ios, href: t.href })),
        { id: "more", label: "More", icon: "ellipsis", href: "#more" },
      ],
      currentTab: tabOf(location.pathname) ?? "overview",
      onTabSelect: (id: string) => {
        const t = TABS.find((x) => x.id === id);
        if (t) go(t.href);
        else openMore();
        return false;
      },
    });
    if (ios) {
      mode.current = "ios";
      document.documentElement.classList.remove("k-android", "k-app");
    } else if (window.KolamM3?.isAndroid) {
      mode.current = "android";
      m3.current = window.KolamM3.init({
        primary: "#993399",
        title: "MyDiary",
        home: "/overview",
        destinations: [
          ...TABS.map((t) => ({ id: t.id, label: t.label, icon: t.m3, onSelect: () => go(t.href) })),
          { id: "more", label: "More", icon: "menu", onSelect: openMore },
        ],
        actions: [
          { icon: "search", label: "Search", onClick: openSearch },
          { icon: "auto_awesome", label: "Assistant", onClick: () => toggleAIPanel() },
          { icon: "add", label: "Quick capture", onClick: () => openQuickCapture() },
        ],
        back: "history",
        isRoot: () => !!tabOf(location.pathname),
      });
    }
    if (!mode.current) return;
    document.documentElement.classList.add("native-app");
    return mirrorTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tab = tabOf(path);
    const title = titleOf(path);
    if (mode.current === "ios") {
      const K = window.KolamIOS!;
      K.tabBar.select(tab ?? "more");
      const actions = [
        { icon: "magnifyingglass", label: "Search", onClick: openSearch },
        { icon: "sparkles", label: "Assistant", onClick: () => toggleAIPanel() },
        { icon: "plus", label: "Quick capture", onClick: () => openQuickCapture() },
      ];
      if (tab) K.navBar.set({ title, large: tab === "overview", actions });
      else K.navBar.set({ title, back: { label: "Back", onClick: () => (history.length > 1 ? history.back() : router.push("/overview")) }, actions });
    } else if (m3.current) {
      const kit = m3.current;
      setTimeout(() => {
        kit.setTitle(title);
        kit.setActive(tab ?? "more");
        kit.setBack(tab ? false : "/overview");
      });
    }
  }, [path, router]);

  return null;
}
