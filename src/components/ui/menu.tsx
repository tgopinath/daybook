"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MenuItem =
  | { type?: "item"; label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; shortcut?: string }
  | { type: "separator" }
  | { type: "label"; label: string };

export function Menu({ trigger, items, align = "end", className }: { trigger: ReactNode; items: MenuItem[]; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className={cn("z-[60] min-w-[190px] rounded-xl border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-[popIn_.12s_ease-out]", className)}
        >
          {items.map((item, i) => {
            if (item.type === "separator") return <M.Separator key={i} className="my-1 h-px bg-line" />;
            if (item.type === "label")
              return (
                <M.Label key={i} className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
                  {item.label}
                </M.Label>
              );
            const Icon = item.icon;
            return (
              <M.Item
                key={i}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[14px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2",
                  item.danger ? "text-danger" : "text-fg",
                )}
              >
                {Icon && <Icon className="h-4 w-4 opacity-70" />}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <span className="text-[11px] text-fg-3">{item.shortcut}</span>}
              </M.Item>
            );
          })}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
