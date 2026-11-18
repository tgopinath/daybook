"use client";
import { useEffect } from "react";
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
import { AIPanel } from "@/components/ai/ai-panel";
import { QuickCapture } from "@/components/capture/quick-capture";
import { SearchPalette } from "@/components/search/search-palette";
import { ReminderRunner } from "@/components/notifications/reminder-runner";
import { TaskDialogHost, openTaskDialog } from "@/components/tasks/task-dialog";
import { EventDialogHost } from "@/components/calendar/event-dialog";

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
        const map: Record<string, string> = { o: "/overview", t: "/tasks", g: "/goals", c: "/calendar", r: "/reminders", h: "/habits", n: "/notes", a: "/assistant", s: "/settings", i: "/insights", p: "/planner" };
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
    const apply = () => root.classList.toggle("dark", s.theme === "dark" || (s.theme === "system" && mq.matches));
    apply();
    root.style.setProperty("--primary", s.accentColor);
    root.classList.toggle("compact", s.density === "compact");
    try {
      localStorage.setItem("pad-theme", s.theme);
      localStorage.setItem("pad-accent", s.accentColor);
      localStorage.setItem("pad-density", s.density);
      if (s.timezone && s.timezone !== "UTC") localStorage.setItem("pad-tz", s.timezone);
    } catch {}
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s?.theme, s?.accentColor, s?.density, s?.timezone]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useShortcuts();
  useAppearance();
  const { aiPanelOpen } = ui.use();

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
      <div className="flex h-dvh overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-28 md:px-8 md:pb-12"
              >
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
    </SWRConfig>
  );
}
