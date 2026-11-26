"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { BarChart3, Download, FileSpreadsheet, List, MoreHorizontal, PiggyBank, Plus, Settings2, Sheet, Trash2, Wallet } from "lucide-react";
import { formatRange, presetRange } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { Kbd, PageHeader, Segmented } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { downloadCsv, exportToSheets, takePendingSheetsExport } from "./actions";
import { AccountsDialogHost, openAccounts } from "./accounts-dialog";
import { BudgetsView } from "./budgets-view";
import { FilterBar } from "./filters";
import { OverviewView } from "./overview";
import { FinanceSettingsHost, openFinanceSettings } from "./settings-dialog";
import { SheetView } from "./sheet-view";
import { TransactionDialogHost, isTxDialogOpen, openTxDialog } from "./transaction-dialog";
import { TransactionsList } from "./transactions-list";
import { FinanceTrashHost, openFinanceTrash } from "./trash-dialog";
import { defaultFilters, filterQuery, useFinanceSettings, useMedia, useToday } from "./use-finance";
import type { Filters } from "./types";

type View = "overview" | "transactions" | "sheet" | "budgets";
const VIEWS: View[] = ["overview", "transactions", "sheet", "budgets"];

const GDS_MESSAGES: Record<string, string> = {
  cancelled: "Google access wasn't granted, so the sheet wasn't created.",
  denied: "Google didn't grant permission to create files. Try again and allow access.",
  expired: "The Google sign-in took too long. Please try the export again.",
  error: "Couldn't connect to Google. Please try again.",
  demo: "Google Sheets export isn't available in the demo. CSV export works.",
  not_configured: "Google Sheets export isn't set up on this server yet.",
  no_encryption: "Google Sheets export isn't fully set up on this server yet.",
};

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function FinanceView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = useToday();
  const isMobile = useMedia("(max-width: 767px)");
  const urlView = params.get("view") as View | null;
  const view: View = urlView && VIEWS.includes(urlView) ? urlView : isMobile ? "transactions" : "overview";

  const [filters, setFilters] = useState<Filters>(() => defaultFilters(today));
  const [overviewRange, setOverviewRange] = useState<Pick<Filters, "preset" | "from" | "to">>(() => defaultFilters(today));
  // The user's timezone can arrive after the first render; re-anchor untouched "this month" ranges.
  useEffect(() => {
    setFilters((f) => (f.preset === "this_month" ? { ...f, ...presetRange("this_month", today) } : f));
    setOverviewRange((r) => (r.preset === "this_month" ? defaultFilters(today) : r));
  }, [today]);

  const query = useMemo(() => filterQuery(filters), [filters]);
  const { data: settings } = useFinanceSettings();

  const setView = (v: View) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  // "A" adds a transaction (ignored while typing, in dialogs, or as part of the global "g a" jump).
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (e.key.toLowerCase() === "g") {
        gAt = Date.now();
        return;
      }
      if (e.key.toLowerCase() !== "a" || Date.now() - gAt < 800) return;
      if (isTxDialogOpen() || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      openTxDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exportRange: { from?: string; to?: string } = view === "overview" ? (overviewRange.preset === "all" ? {} : { from: overviewRange.from, to: overviewRange.to }) : filters.preset === "all" ? {} : { from: filters.from, to: filters.to };

  const runSheetsExport = useCallback(
    async (range: { from?: string; to?: string }, userGesture: boolean) => {
      // Open the tab during the click so pop-up blockers allow it; it's pointed at the sheet once ready.
      const win = userGesture ? window.open("about:blank", "_blank") : null;
      if (win) {
        win.opener = null;
        win.document.title = "Creating your sheet…";
        win.document.body.innerHTML = '<p style="font:15px system-ui;padding:24px">Creating your Google Sheet…</p>';
      }
      const t = toast.info("Creating your Google Sheet…", { duration: 20000 });
      try {
        const res = await exportToSheets(range, { returnTo: `${pathname}?view=${view}`, win });
        toast.dismiss(t);
        if (res) toast.success(`Exported ${res.rows} transaction${res.rows === 1 ? "" : "s"} to Google Sheets`);
      } catch (err) {
        toast.dismiss(t);
        toastError(err);
      }
    },
    [pathname, view],
  );

  // /finance?add=expense|income (the "New" menu, My space) opens the transaction form.
  const add = params.get("add");
  useEffect(() => {
    if (add !== "expense" && add !== "income") return;
    const sp = new URLSearchParams(params.toString());
    sp.delete("add");
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
    openTxDialog({ preset: { type: add } });
  }, [add]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from Google's consent screen: ?gds=connected resumes the pending export.
  const handled = useRef(false);
  useEffect(() => {
    const gds = params.get("gds");
    if (!gds || handled.current) return;
    handled.current = true;
    const sp = new URLSearchParams(params.toString());
    sp.delete("gds");
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
    if (gds === "connected") {
      const pending = takePendingSheetsExport();
      if (pending) void runSheetsExport(pending, false);
      else toast.success("Google connected — you can export to Sheets now");
    } else {
      takePendingSheetsExport();
      toast.error(GDS_MESSAGES[gds] ?? GDS_MESSAGES.error!);
    }
  }, [params, pathname, router, runSheetsExport]);

  const csv = async () => {
    try {
      const q = view === "transactions" || view === "sheet" ? query : new URLSearchParams(Object.entries(exportRange).filter((e): e is [string, string] => !!e[1])).toString();
      await downloadCsv(q);
      toast.success("CSV downloaded");
    } catch (err) {
      toastError(err);
    }
  };

  const sheets = settings?.sheets;
  const rangeLabel = exportRange.from && exportRange.to ? formatRange(exportRange.from, exportRange.to) : "All time";

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title="My Finance"
        description="Your money diary — what came in, what went out, and where."
        actions={
          <>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4" aria-hidden /> Export
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="end" sideOffset={6} className="z-[60] w-[min(320px,calc(100vw-24px))] rounded-xl border border-line bg-surface p-2 shadow-pop">
                  <p className="px-2 pt-1 pb-2 text-[12px] text-fg-2">
                    {rangeLabel}
                    {view === "transactions" || view === "sheet" ? " · current filters apply to CSV" : ""}
                  </p>
                  <Popover.Close asChild>
                    <button type="button" onClick={csv} className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                      <Download className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" aria-hidden />
                      <span>
                        <span className="block text-[13.5px] font-medium text-fg">Download CSV</span>
                        <span className="block text-[12px] text-fg-2">Opens in Excel, Numbers or Sheets</span>
                      </span>
                    </button>
                  </Popover.Close>
                  <Popover.Close asChild>
                    <button
                      type="button"
                      disabled={!sheets?.available}
                      onClick={() => void runSheetsExport(exportRange, true)}
                      className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" aria-hidden />
                      <span>
                        <span className="block text-[13.5px] font-medium text-fg">Export to Google Sheets</span>
                        <span className="block text-[12px] text-fg-2">
                          {!sheets ? "Checking…" : sheets.available ? (sheets.connected ? "Creates a new spreadsheet in your Drive" : "You'll be asked to allow My Diary to create a file") : sheets.message}
                        </span>
                      </span>
                    </button>
                  </Popover.Close>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <Menu
              trigger={
                <Button variant="outline" size="icon" aria-label="More finance options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                { label: "Accounts", icon: Wallet, onSelect: () => openAccounts() },
                { label: "Deleted transactions", icon: Trash2, onSelect: openFinanceTrash },
                { label: "Finance settings", icon: Settings2, onSelect: openFinanceSettings },
              ]}
            />
            <Button onClick={() => openTxDialog()} className="hidden md:inline-flex">
              <Plus className="h-4 w-4" aria-hidden /> Add transaction <Kbd>A</Kbd>
            </Button>
          </>
        }
      >
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "overview", label: "Overview", icon: BarChart3 },
            { value: "transactions", label: "Transactions", icon: List },
            { value: "sheet", label: "Sheet", icon: Sheet },
            { value: "budgets", label: "Budgets", icon: PiggyBank },
          ]}
        />
      </PageHeader>

      <div role="tabpanel" aria-label={view}>
        {view === "overview" && <OverviewView range={overviewRange} onRange={setOverviewRange} onShowBudgets={() => setView("budgets")} />}
        {(view === "transactions" || view === "sheet") && (
          <div className="flex flex-col gap-4">
            <FilterBar filters={filters} onChange={setFilters} />
            {view === "transactions" ? (
              <TransactionsList filters={filters} query={query} onClearFilters={() => setFilters({ ...defaultFilters(today), preset: "all" })} />
            ) : (
              <SheetView query={query} />
            )}
          </div>
        )}
        {view === "budgets" && <BudgetsView />}
      </div>

      {/* Phones: quick add above the bottom navigation. */}
      <button
        type="button"
        onClick={() => openTxDialog()}
        aria-label="Add transaction"
        className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop md:hidden"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>

      <TransactionDialogHost />
      <AccountsDialogHost />
      <FinanceSettingsHost />
      <FinanceTrashHost />
    </div>
  );
}
