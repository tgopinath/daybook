"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, CheckCircle2, Flag, FolderInput, Trash2, X } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { PRIORITY_META } from "@/components/ui/misc";
import { useApi } from "@/lib/client";
import { bulkTasks } from "@/components/tasks/actions";
import type { Priority } from "@/components/tasks/types";

export function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const { data: cats } = useApi<{ items: { id: string; name: string }[] }>("/api/categories?kind=task");
  const run = async (action: Parameters<typeof bulkTasks>[1], value?: string | null) => {
    const list = [...ids];
    onClear();
    await bulkTasks(list, action, value);
  };
  return (
    <AnimatePresence>
      {ids.length > 0 && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed inset-x-3 bottom-[76px] z-40 mx-auto flex max-w-[640px] items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-modal md:bottom-6 scroll-thin"
        >
          <span className="px-2 text-[13px] font-medium whitespace-nowrap tabular-nums">{ids.length} selected</span>
          <div className="mx-1 h-5 w-px shrink-0 bg-line" />
          <Button variant="ghost" size="sm" onClick={() => void run("complete")}>
            <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">Complete</span>
          </Button>
          <Menu
            align="center"
            trigger={
              <Button variant="ghost" size="sm">
                <Flag className="h-4 w-4" /> <span className="hidden sm:inline">Priority</span>
              </Button>
            }
            items={(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => ({ label: PRIORITY_META[p].label, icon: Flag, onSelect: () => void run("priority", p) }))}
          />
          <Menu
            align="center"
            trigger={
              <Button variant="ghost" size="sm">
                <FolderInput className="h-4 w-4" /> <span className="hidden sm:inline">Move</span>
              </Button>
            }
            items={[
              { type: "label", label: "Move to category" },
              ...(cats?.items ?? []).map((c) => ({ label: c.name, onSelect: () => void run("category", c.id) })),
              { type: "separator" as const },
              { label: "No category", onSelect: () => void run("category", null) },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={() => void run("archive")}>
            <Archive className="h-4 w-4" /> <span className="hidden sm:inline">Archive</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => void run("delete")}>
            <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
          </Button>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" aria-label="Clear selection" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
