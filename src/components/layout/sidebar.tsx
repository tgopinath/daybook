"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Plus, LogOut, Settings, ChevronsUpDown } from "lucide-react";
import { NAV, type NavItem } from "./nav";
import { ui, openQuickCapture } from "@/lib/ui-store";
import { useMe } from "@/lib/use-me";
import { cn, initials } from "@/lib/utils";
import { Menu } from "@/components/ui/menu";
import { api } from "@/lib/client";
import { openTaskDialog } from "@/components/tasks/task-dialog";

export function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed } = ui.use();
  const collapsed = !mobile && sidebarCollapsed;
  const { data: me } = useMe();

  const itemClass = (active: boolean) =>
    cn(
      "group flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13.5px] transition-colors",
      active ? "bg-surface text-fg font-medium shadow-card" : "text-fg-2 hover:bg-surface hover:text-fg",
      collapsed && "justify-center px-0",
    );

  const renderItem = (item: NavItem) => {
    const active = !!item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));
    const inner = (
      <>
        <item.icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-primary" : "opacity-80")} />
        {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
        {!collapsed && item.shortcut && <span className="text-[11px] text-fg-3 opacity-0 group-hover:opacity-100">{item.shortcut}</span>}
      </>
    );
    if (item.action === "quick-capture")
      return (
        <button key={item.label} className={itemClass(false)} title={collapsed ? item.label : undefined} onClick={() => { openQuickCapture(); onNavigate?.(); }}>
          {inner}
        </button>
      );
    return (
      <Link key={item.label} href={item.href!} aria-current={active ? "page" : undefined} className={itemClass(active)} title={collapsed ? item.label : undefined} onClick={onNavigate}>
        {inner}
      </Link>
    );
  };

  async function logout() {
    await api.post("/api/auth/logout");
    window.location.assign("/login"); // full reload drops the previous user's cached data
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-line bg-bg transition-[width] duration-200",
        mobile ? "w-[280px]" : collapsed ? "w-[64px]" : "w-[248px]",
      )}
      aria-label="Main navigation"
    >
      <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        {!collapsed && <span className="flex-1 text-[15px] font-semibold tracking-tight">Daybook</span>}
        {!mobile && !collapsed && (
          <button onClick={() => ui.set({ sidebarCollapsed: true })} className="rounded-md p-1 text-fg-3 hover:bg-surface hover:text-fg" aria-label="Collapse sidebar" title="Collapse (⌘\)">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <button
          onClick={() => { openTaskDialog(); onNavigate?.(); }}
          className={cn("flex h-9 w-full items-center gap-2 rounded-[10px] bg-primary px-3 text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgba(99,91,255,.25)] hover:bg-primary-hover", collapsed && "justify-center px-0")}
          title="New task (N)"
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span>New task</span>}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 scroll-thin" style={collapsed ? { paddingInline: 8 } : undefined}>
        {NAV.map((group) => (
          <div key={group.section} className="mt-4 first:mt-2">
            {!collapsed ? (
              <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{group.section}</div>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" />
            )}
            <div className="flex flex-col gap-0.5">{group.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      {collapsed && (
        <button onClick={() => ui.set({ sidebarCollapsed: false })} className="mx-auto mb-2 rounded-md p-1.5 text-fg-3 hover:bg-surface hover:text-fg" aria-label="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div className="border-t border-line p-2">
        <Menu
          align="start"
          trigger={
            <button className={cn("flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-surface", collapsed && "justify-center")}>
              <Avatar name={me?.user.name ?? ""} src={me?.user.avatarUrl} />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{me?.user.name ?? "…"}</div>
                    <div className="truncate text-[11.5px] text-fg-3">{me?.user.email}</div>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-fg-3" />
                </>
              )}
            </button>
          }
          items={[
            { label: "Settings", icon: Settings, onSelect: () => { router.push("/settings"); onNavigate?.(); } },
            { type: "separator" },
            { label: "Sign out", icon: LogOut, onSelect: logout },
          ]}
        />
      </div>
    </aside>
  );
}

export function Avatar({ name, src, size = 30 }: { name: string; src?: string | null; size?: number }) {
  if (src) return <img src={src} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name) || "·"}
    </div>
  );
}
