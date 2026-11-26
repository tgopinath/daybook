"use client";
import { RotateCcw, Trash2 } from "lucide-react";
import { formatDay } from "@/lib/finance";
import { create } from "@/components/ui/store";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { purgeTx, restoreTx } from "./actions";
import { amountClass, signedAmount } from "./transactions-list";
import { useMoney, useTxPages } from "./use-finance";

const store = create<{ open: boolean }>({ open: false });
export const openFinanceTrash = () => store.set({ open: true });

export function FinanceTrashHost() {
  const { open } = store.use();
  return open ? <TrashDialog /> : null;
}

function TrashDialog() {
  const { fmt } = useMoney();
  const { items, isLoading, hasMore, loadMore, loadingMore } = useTxPages("", { scope: "trash" });
  return (
    <Dialog open onOpenChange={(o) => store.set({ open: o })} title="Deleted transactions" description="Restore a transaction or delete it forever." size="md">
      {isLoading && !items.length ? (
        <SkeletonList rows={4} />
      ) : !items.length ? (
        <p className="py-8 text-center text-sm text-fg-2">The trash is empty.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-fg">{t.title}</span>
                <span className="block text-[12px] text-fg-3">
                  {formatDay(t.date, { year: true })} · {t.category}
                </span>
              </span>
              <span className={cn("text-[14px] font-semibold tabular-nums", amountClass(t.type))}>{signedAmount(fmt, t)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Restore ${t.title}`} onClick={() => void restoreTx(t.id)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.title} forever`} onClick={() => void purgeTx(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </Dialog>
  );
}
