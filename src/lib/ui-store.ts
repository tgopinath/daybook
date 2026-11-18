"use client";
import { create } from "@/components/ui/store";

/** Global UI state for panels and overlays that can be opened from anywhere. */
export const ui = create({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  aiPanelOpen: false,
  quickCaptureOpen: false,
  quickCaptureText: "",
  searchOpen: false,
  notificationsOpen: false,
});

export const openQuickCapture = (text = "") => ui.set({ quickCaptureOpen: true, quickCaptureText: text });
export const openSearch = () => ui.set({ searchOpen: true });
export const toggleAIPanel = (open?: boolean) => ui.set((s) => ({ aiPanelOpen: open ?? !s.aiPanelOpen }));
