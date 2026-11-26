"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { MOBILE_NAV, isNavActive } from "./nav";
import { Sidebar } from "./sidebar";
import { ui, openQuickCapture } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="site-tabbar fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Mobile navigation">
      {MOBILE_NAV.map((item) => {
        const active = isNavActive(item, pathname);
        const cls = cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-primary" : "text-fg-2");
        if (item.action === "quick-capture")
          return (
            <button key={item.label} className={cls} onClick={() => openQuickCapture()}>
              <span className="-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop"><item.icon className="h-5 w-5" /></span>
              {item.label}
            </button>
          );
        return (
          <Link key={item.label} href={item.href!} aria-current={active ? "page" : undefined} className={cls}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <button className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-fg-2" onClick={() => ui.set({ mobileNavOpen: true })}>
        <MoreHorizontal className="h-5 w-5" />
        More
      </button>
    </nav>
  );
}

export function MobileDrawer() {
  const { mobileNavOpen } = ui.use();
  const close = () => ui.set({ mobileNavOpen: false });
  return (
    <AnimatePresence>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            className="absolute inset-y-0 left-0 shadow-modal"
            initial={{ x: -290 }}
            animate={{ x: 0 }}
            exit={{ x: -290 }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag="x"
            dragConstraints={{ left: -290, right: 0 }}
            dragElastic={0.05}
            onDragEnd={(_, info) => info.offset.x < -80 && close()}
          >
            <Sidebar mobile onNavigate={close} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
