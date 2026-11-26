"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SWRConfig } from "swr";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileBottomNav, MobileDrawer } from "./mobile-nav";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";
import { ui, openQuickCapture, openSearch, toggleAIPanel } from "@/lib/ui-store";
import { useMe } from "@/lib/use-me";
import { api } from "@/lib/client";
import { accentVars, normalizeAccent } from "@/lib/accent";
import { AIPanel } from "@/components/ai/ai-panel";
import { QuickCapture } from "@/components/capture/quick-capture";
import { SearchPalette } from "@/components/search/search-palette";
import { ReminderRunner } from "@/components/notifications/reminder-runner";
import { TaskDialogHost, openTaskDialog } from "@/components/tasks/task-dialog";
import { EventDialogHost } from "@/components/calendar/event-dialog";
import { NativeLooks } from "./native-looks";
import { AppLockOverlay } from "@/components/security/app-lock-overlay";
import { MySpaceBackLink } from "@/components/my-space/back-link";

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function useShortcuts() {
  const router = useRouter();
  useEffect(() => {
    let gPressed = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openQuickCapture(); return; }
      if (mod && e.key === ".") { e.preventDefault(); toggleAIPanel(); return; }
      if (mod && e.key === "\\") { e.preventDefault(); ui.set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })); return; }
      if (mod || e.altKey || isTyping(e)) return;
      if (e.key === "/") { e.preventDefault(); openSearch(); return; }
      if (e.key.toLowerCase() === "n") { e.preventDefault(); openTaskDialog(); return; }
      // "g" then a letter jumps to a section, like Linear.
      if (e.key.toLowerCase() === "g") { gPressed = Date.now(); return; }
      if (Date.now() - gPressed < 800) {
        const map: Record<string, string> = { o: "/my-space", m: "/my-space", t: "/tasks", g: "/goals", c: "/calendar", r: "/reminders", h: "/habits", n: "/notes", a: "/assistant", s: "/settings", i: "/insights", p: "/planner" };
        const to = map[e.key.toLowerCase()];
        if (to) { e.preventDefault(); router.push(to); }
        gPressed = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

/** Mirrors appearance settings onto <html> and localStorage (read pre-paint by the layout script). */
function useAppearance() {
  const { data } = useMe();
  const s = data?.settings;
  useEffect(() => {
    if (!s) return;
    const root = document.documentElement;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = s.theme === "dark" || (s.theme === "system" && mq.matches);
      root.classList.toggle("dark", dark);
      // Accent plus readable text shades for it (WCAG AA) in the active theme.
      const vars = accentVars(s.accentColor, dark);
      for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
      try {
        localStorage.setItem("pad-accent-vars", JSON.stringify(vars));
      } catch {}
    };
    apply();
    root.classList.toggle("compact", s.density === "compact");
    try {
      localStorage.setItem("pad-theme", s.theme);
      localStorage.setItem("pad-accent", normalizeAccent(s.accentColor));
      localStorage.setItem("pad-density", s.density);
      if (s.timezone && s.timezone !== "UTC") localStorage.setItem("pad-tz", s.timezone);
    } catch {}
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s?.theme, s?.accentColor, s?.density, s?.timezone]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Shown on every screen while exploring the demo (a throwaway sample account). */
function DemoBanner() {
  const [leaving, setLeaving] = useState(false);
  async function exit() {
    setLeaving(true);
    try {
      await api.post("/api/auth/logout"); // also deletes the sample account
    } finally {
      window.location.assign("/login");
    }
  }
  return (
    <div role="note" className="demo-banner flex items-center gap-2 border-b border-line bg-primary-soft px-4 py-1.5 text-[13px] text-fg">
      <span className="rounded bg-primary px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-on-primary">Demo</span>
      <span className="min-w-0 flex-1 truncate sm:hidden">Sample data. Your changes are temporary.</span>
      <span className="hidden min-w-0 flex-1 sm:inline">
        You&apos;re exploring My Diary with sample data for a fictional user. Changes are temporary and kept apart from real accounts, so don&apos;t enter real personal details.
      </span>
      <button
        onClick={exit}
        disabled={leaving}
        className="shrink-0 rounded-md px-2 py-0.5 text-[13px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
      >
        {leaving ? "Leaving…" : "Exit demo"}
      </button>
    </div>
  );
}

export function AppShell({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  const pathname = usePathname();
  useShortcuts();
  useAppearance();
  const { aiPanelOpen } = ui.use();

  useEffect(() => {
    if (demo) document.documentElement.dataset.demo = "1";
    else delete document.documentElement.dataset.demo;
  }, [demo]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("pad-sidebar");
      if (v) ui.set({ sidebarCollapsed: v === "1" });
      if (localStorage.getItem("pad-ai-panel") === "1" && window.innerWidth >= 1280) ui.set({ aiPanelOpen: true });
    } catch {}
    const unsubscribe = ui.subscribe(() => {
      try {
        localStorage.setItem("pad-sidebar", ui.get().sidebarCollapsed ? "1" : "0");
        localStorage.setItem("pad-ai-panel", ui.get().aiPanelOpen ? "1" : "0");
      } catch {}
    });
    return () => void unsubscribe();
  }, []);

  return (
    <SWRConfig value={{ errorRetryCount: 2 }}>
      <NativeLooks />
      {/* relative: absolutely-positioned descendants (e.g. sr-only labels) must not stretch the document and scroll the whole frame */}
      <div className="app-root relative flex h-dvh overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {demo && <DemoBanner />}
          <Topbar />
          <main id="main" className="relative min-h-0 flex-1 overflow-y-auto scroll-thin">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-28 md:px-8 md:pb-12"
              >
                <MySpaceBackLink />
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <AnimatePresence initial={false}>
          {aiPanelOpen && (
            <motion.div
              key="ai"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-40 overflow-hidden xl:static xl:z-auto"
            >
              <AIPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <MobileBottomNav />
      <MobileDrawer />
      <QuickCapture />
      <SearchPalette />
      <TaskDialogHost />
      <EventDialogHost />
      <ReminderRunner />
      <ConfirmHost />
      <Toaster />
      <AppLockOverlay />
    </SWRConfig>
  );
}
