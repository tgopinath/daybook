"use client";
import { Menu as MenuIcon, Search, Sparkles, Plus } from "lucide-react";
import { ui, openSearch, toggleAIPanel } from "@/lib/ui-store";
import { Kbd } from "@/components/ui/misc";
import { NotificationBell } from "@/components/notifications/notification-center";
import { openTaskDialog } from "@/components/tasks/task-dialog";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { aiPanelOpen } = ui.use();
  return (
    <header className="site-header sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur-md md:px-6">
      <button className="-ml-1 rounded-lg p-2 text-fg-2 hover:bg-surface-2 lg:hidden" onClick={() => ui.set({ mobileNavOpen: true })} aria-label="Open navigation">
        <MenuIcon className="h-5 w-5" />
      </button>
      <button
        onClick={openSearch}
        className="flex h-9 max-w-[420px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] text-fg-3 transition-colors hover:border-line-strong"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search everything…</span>
        <span className="hidden sm:inline-flex"><Kbd>/</Kbd></span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <button onClick={() => openTaskDialog()} className="hidden h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13.5px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg sm:flex" title="Quick add task (N)">
          <Plus className="h-4 w-4" /> Add
        </button>
        <button
          onClick={() => toggleAIPanel()}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors",
            aiPanelOpen ? "bg-primary-soft text-primary" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
          )}
          aria-pressed={aiPanelOpen}
          title="AI panel (⌘.)"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Assistant</span>
        </button>
      </div>
    </header>
  );
}
