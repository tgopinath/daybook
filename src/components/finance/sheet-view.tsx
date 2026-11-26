"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Expand, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { amountInRange, parseAmount, toInputString } from "@/lib/money";
import { DEFAULT_CATEGORIES, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, TRANSFER_CATEGORY, formatDay, isDayKey, type PaymentMethod } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Card, Kbd, Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { deleteTx } from "./actions";
import { openTxDialog } from "./transaction-dialog";
import { amountClass, signedAmount } from "./transactions-list";
import { refreshFinance, useAccounts, useCategories, useMoney, useToday, useTxPages } from "./use-finance";
import type { Account, Tx, TxType } from "./types";

type ColKey = "date" | "type" | "category" | "payee" | "account" | "method" | "amount" | "note";
type Kind = "date" | "select" | "text" | "amount";
const COLS: { key: ColKey; label: string; kind: Kind; className: string }[] = [
  { key: "date", label: "Date", kind: "date", className: "w-[132px]" },
  { key: "type", label: "Type", kind: "select", className: "w-[104px]" },
  { key: "category", label: "Category", kind: "text", className: "w-[160px]" },
  { key: "payee", label: "Payee", kind: "text", className: "w-[170px]" },
  { key: "account", label: "Account", kind: "select", className: "w-[150px]" },
  { key: "method", label: "Method", kind: "select", className: "w-[118px]" },
  { key: "amount", label: "Amount", kind: "amount", className: "w-[130px] text-right" },
  { key: "note", label: "Note", kind: "text", className: "min-w-[180px]" },
];
const TYPE_LABEL: Record<TxType, string> = { expense: "Expense", income: "Income", transfer: "Transfer" };

type Row = Pick<Tx, "type" | "amount" | "date" | "category" | "payee" | "accountId" | "toAccountId" | "paymentMethod" | "note"> & { id: string };
type NewRow = { date: string; type: TxType; category: string; payee: string; accountId: string; paymentMethod: string; amount: string; note: string };

const LAST_KEY = "mydiary-finance-last";
function lastAccount() {
  try {
    return (JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as { accountId?: string }).accountId ?? "";
  } catch {
    return "";
  }
}

/** Spreadsheet-style editor over the filtered transactions. */
export function SheetView({ query }: { query: string }) {
  const { currency, fmt } = useMoney();
  const today = useToday();
  const { items, totals, hasMore, loadMore, loadingMore, isLoading, error } = useTxPages(query, { limit: 100 });
  const { data: acc } = useAccounts(true);
  const { data: cats } = useCategories();
  const accounts = useMemo(() => acc?.items ?? [], [acc]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryList = useMemo(() => [...new Set([...DEFAULT_CATEGORIES.map((c) => c.name), ...(cats?.custom.map((c) => c.name) ?? [])])], [cats]);

  const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});
  const rows: Row[] = useMemo(() => items.map((t) => ({ ...t, ...overrides[t.id] })), [items, overrides]);

  const blankNew = useCallback((): NewRow => {
    const active = accounts.filter((a) => !a.archivedAt);
    const last = lastAccount();
    return { date: today, type: "expense", category: "", payee: "", accountId: active.some((a) => a.id === last) ? last : active[0]?.id ?? "", paymentMethod: "", amount: "", note: "" };
  }, [accounts, today]);
  const [newRow, setNewRow] = useState<NewRow>(blankNew);
  useEffect(() => {
    setNewRow((n) => (n.accountId || !accounts.length ? n : { ...n, accountId: blankNew().accountId }));
  }, [accounts, blankNew]);
  const [creating, setCreating] = useState(false);

  const total = rows.length + 1; // + add-row
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const gridRef = useRef<HTMLTableElement>(null);
  const keepFocus = useRef(false);
  // Synchronous mirror of `editing` so a blur fired while the editor unmounts can't save twice.
  const editingRef = useRef(false);

  // Keep the active cell inside the grid as rows load or disappear.
  useEffect(() => {
    setActive((a) => (a.r >= total ? { r: total - 1, c: a.c } : a));
  }, [total]);

  // Move DOM focus to the active cell when navigating (not while an editor is open).
  useLayoutEffect(() => {
    if (editing || !keepFocus.current) return;
    cellRefs.current.get(`${active.r}:${active.c}`)?.focus({ preventScroll: false });
  }, [active, editing]);

  const isNew = (r: number) => r === rows.length;

  const readOnly = (r: number, c: ColKey) => {
    const type = isNew(r) ? newRow.type : rows[r]?.type;
    return type === "transfer" && (c === "category" || c === "method");
  };

  const editValue = (r: number, c: ColKey): string => {
    if (isNew(r)) return String(newRow[c === "account" ? "accountId" : c === "method" ? "paymentMethod" : c] ?? "");
    const t = rows[r]!;
    switch (c) {
      case "amount":
        return toInputString(t.amount, currency);
      case "account":
        return t.accountId ?? "";
      case "method":
        return t.paymentMethod ?? "";
      default:
        return String(t[c] ?? "");
    }
  };

  const move = (dr: number, dc: number) => {
    keepFocus.current = true;
    setActive((a) => {
      let r = a.r + dr;
      let c = a.c + dc;
      if (c >= COLS.length) {
        c = 0;
        r++;
      } else if (c < 0) {
        c = COLS.length - 1;
        r--;
      }
      return { r: Math.max(0, Math.min(total - 1, r)), c };
    });
  };

  const startEdit = (initial?: string) => {
    const col = COLS[active.c]!;
    if (readOnly(active.r, col.key)) return;
    if (!isNew(active.r) && col.key === "type" && rows[active.r]?.type === "transfer") return void openTxDialog({ tx: items[active.r] });
    setDraft(initial ?? editValue(active.r, col.key));
    editingRef.current = true;
    setEditing(true);
  };

  const createFrom = async (n: NewRow) => {
    const minor = parseAmount(n.amount, currency);
    if (minor === null || !amountInRange(minor)) {
      toast.error("Enter an amount to add the row");
      return false;
    }
    if (n.type === "transfer") {
      openTxDialog({ preset: { type: "transfer", date: n.date, accountId: n.accountId || null } });
      return false;
    }
    setCreating(true);
    try {
      await api.post("/api/finance/transactions", {
        type: n.type,
        amount: minor,
        date: isDayKey(n.date) ? n.date : today,
        category: n.category.trim() || "Other",
        accountId: n.accountId || null,
        paymentMethod: n.paymentMethod || null,
        payee: n.payee.trim() || null,
        note: n.note.trim() || null,
        tags: [],
      });
      await refreshFinance();
      // Keep date/type/account/method for fast entry of the next row.
      setNewRow((p) => ({ ...blankNew(), date: p.date, type: p.type, accountId: p.accountId, paymentMethod: p.paymentMethod }));
      toast.success("Row added");
      return true;
    } catch (err) {
      toastError(err);
      return false;
    } finally {
      setCreating(false);
    }
  };

  /** Saves the open editor. Returns false when the value was rejected (editor stays open). */
  const commit = (value = draft): boolean => {
    if (!editingRef.current) return true;
    editingRef.current = false;
    const col = COLS[active.c]!;
    const r = active.r;
    setEditing(false);
    keepFocus.current = true;
    if (isNew(r)) {
      const key = col.key === "account" ? "accountId" : col.key === "method" ? "paymentMethod" : col.key;
      setNewRow((p) => ({ ...p, [key]: value }));
      return true;
    }
    const t = rows[r]!;
    let patch: Record<string, unknown> | null = null;
    let local: Partial<Row> = {};
    switch (col.key) {
      case "amount": {
        const minor = parseAmount(value, currency);
        if (minor === null || !amountInRange(minor)) {
          toast.error("Enter a positive amount, like 1,250.50");
          return false;
        }
        if (minor !== t.amount) (patch = { amount: minor }), (local = { amount: minor });
        break;
      }
      case "date":
        if (!isDayKey(value)) {
          toast.error("Pick a valid date");
          return false;
        }
        if (value !== t.date) (patch = { date: value }), (local = { date: value });
        break;
      case "type":
        if (value === "transfer") {
          openTxDialog({ tx: { ...items[r]!, type: "transfer" } });
          return true;
        }
        if (value !== t.type) (patch = { type: value }), (local = { type: value as TxType });
        break;
      case "category": {
        const v = value.trim() || "Other";
        if (v !== t.category) (patch = { category: v.slice(0, 40) }), (local = { category: v.slice(0, 40) });
        break;
      }
      case "account":
        if ((value || null) !== t.accountId) (patch = { accountId: value || null }), (local = { accountId: value || null });
        break;
      case "method":
        if ((value || null) !== t.paymentMethod) (patch = { paymentMethod: value || null }), (local = { paymentMethod: value || null });
        break;
      case "payee":
      case "note": {
        const v = value.trim() || null;
        if (v !== t[col.key]) (patch = { [col.key]: v }), (local = { [col.key]: v });
        break;
      }
    }
    if (!patch) return true;
    // Show the new value right away and save in the background so navigation never waits on the network.
    setOverrides((o) => ({ ...o, [t.id]: { ...o[t.id], ...local } }));
    const body = patch;
    void (async () => {
      try {
        await api.patch(`/api/finance/transactions/${t.id}`, body);
        await refreshFinance();
      } catch (err) {
        toastError(err);
      } finally {
        setOverrides((o) => {
          const { [t.id]: _drop, ...rest } = o;
          return rest;
        });
      }
    })();
    return true;
  };

  const onGridKey = (e: KeyboardEvent) => {
    if (editing) return;
    const k = e.key;
    if (k === "ArrowDown") (e.preventDefault(), move(1, 0));
    else if (k === "ArrowUp") (e.preventDefault(), move(-1, 0));
    else if (k === "ArrowRight") (e.preventDefault(), move(0, 1));
    else if (k === "ArrowLeft") (e.preventDefault(), move(0, -1));
    // Tab (when not editing) leaves the grid so keyboard users are never trapped; arrows move between cells.
    else if (k === "Home") (e.preventDefault(), (keepFocus.current = true), setActive((a) => ({ r: e.ctrlKey || e.metaKey ? 0 : a.r, c: 0 })));
    else if (k === "End") (e.preventDefault(), (keepFocus.current = true), setActive((a) => ({ r: e.ctrlKey || e.metaKey ? total - 1 : a.r, c: COLS.length - 1 })));
    else if (k === "Enter" || k === "F2") {
      e.preventDefault();
      if (k === "Enter" && isNew(active.r) && newRow.amount.trim() && !e.shiftKey) void createFrom(newRow);
      else startEdit();
    } else if ((k === "Delete" || k === "Backspace") && !isNew(active.r) && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const t = items[active.r];
      if (t) void deleteTx(t);
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const col = COLS[active.c]!;
      if (col.kind === "text" || col.kind === "amount") {
        e.preventDefault();
        startEdit(k);
      }
    }
  };

  const onEditorKey = async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't close dialogs / clear anything else
      editingRef.current = false;
      setEditing(false);
      keepFocus.current = true;
      setActive((a) => ({ ...a }));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const wasNew = isNew(active.r);
      const value = (e.target as HTMLInputElement).value;
      const ok = commit(value);
      if (!ok) {
        setDraft(value);
        editingRef.current = true;
        return setEditing(true);
      }
      if (e.key === "Enter" && wasNew) {
        const merged = { ...newRow, [COLS[active.c]!.key === "account" ? "accountId" : COLS[active.c]!.key === "method" ? "paymentMethod" : COLS[active.c]!.key]: value };
        if (merged.amount.trim()) {
          if (await createFrom(merged as NewRow)) setActive({ r: rows.length + 1, c: 0 });
          return;
        }
        return move(0, 1);
      }
      move(e.key === "Enter" ? 1 : 0, e.key === "Tab" ? (e.shiftKey ? -1 : 1) : 0);
    }
  };

  const display = (r: number, c: ColKey, a: Map<string, Account>) => {
    if (isNew(r)) {
      const n = newRow;
      switch (c) {
        case "date":
          return n.date ? formatDay(n.date, { year: true }) : "";
        case "type":
          return TYPE_LABEL[n.type];
        case "account":
          return n.accountId ? a.get(n.accountId)?.name ?? "" : "";
        case "method":
          return n.paymentMethod ? PAYMENT_METHOD_LABEL[n.paymentMethod as PaymentMethod] : "";
        case "category":
          return n.type === "transfer" ? TRANSFER_CATEGORY : n.category;
        default:
          return n[c];
      }
    }
    const t = rows[r]!;
    switch (c) {
      case "date":
        return formatDay(t.date, { year: true });
      case "type":
        return TYPE_LABEL[t.type];
      case "account":
        return t.type === "transfer" ? `${t.accountId ? a.get(t.accountId)?.name ?? "—" : "—"} → ${t.toAccountId ? a.get(t.toAccountId)?.name ?? "—" : "—"}` : t.accountId ? a.get(t.accountId)?.name ?? "" : "";
      case "method":
        return t.paymentMethod ? PAYMENT_METHOD_LABEL[t.paymentMethod as PaymentMethod] ?? t.paymentMethod : "";
      case "amount":
        return signedAmount(fmt, t);
      default:
        return t[c] ?? "";
    }
  };

  if (isLoading && !items.length)
    return (
      <Card className="p-4" aria-busy="true" aria-label="Loading sheet">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full" />
        ))}
      </Card>
    );
  if (error && !items.length)
    return (
      <Card className="p-6 text-center text-sm text-fg-2" role="alert">
        Couldn&apos;t load the sheet. {error.message}
      </Card>
    );

  const renderEditor = (r: number, c: (typeof COLS)[number]) => {
    const common = {
      autoFocus: true,
      "aria-label": `${c.label}${isNew(r) ? " for new row" : ""}`,
      onKeyDown: onEditorKey,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (editingRef.current) void commit(e.target.value);
      },
      className: "h-9 w-full rounded-none border-0 bg-surface px-2 text-[14px] text-fg outline-none ring-2 ring-primary ring-inset",
    };
    const type = isNew(r) ? newRow.type : rows[r]!.type;
    if (c.kind === "date") return <input type="date" defaultValue={draft} {...common} />;
    if (c.key === "type")
      return (
        <select defaultValue={draft} {...common} onChange={(e) => void commit(e.target.value)}>
          {(Object.keys(TYPE_LABEL) as TxType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      );
    if (c.key === "account")
      return (
        <select defaultValue={draft} {...common} onChange={(e) => void commit(e.target.value)}>
          <option value="">{type === "transfer" ? "Choose…" : "No account"}</option>
          {accounts
            .filter((a) => !a.archivedAt || a.id === draft)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      );
    if (c.key === "method")
      return (
        <select defaultValue={draft} {...common} onChange={(e) => void commit(e.target.value)}>
          <option value="">Not set</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      );
    return (
      <input
        type="text"
        defaultValue={draft}
        list={c.key === "category" ? "fin-sheet-categories" : undefined}
        inputMode={c.kind === "amount" ? "decimal" : undefined}
        maxLength={c.key === "note" ? 1000 : c.key === "payee" ? 120 : c.key === "category" ? 40 : 24}
        onFocus={(e) => {
          const el = e.currentTarget;
          // Typing a key to start editing replaces the value; Enter/F2 keeps it with the caret at the end.
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        }}
        {...common}
        className={cn(common.className, c.kind === "amount" && "text-right tabular-nums")}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="hidden px-1 text-[12px] text-fg-2 md:block">
        Click a cell or use the arrow keys. <Kbd>Enter</Kbd> edits and saves, <Kbd>Tab</Kbd> saves and moves right while editing, <Kbd>Esc</Kbd> cancels. Type in the last row and press <Kbd>Enter</Kbd> to add it.
      </p>
      <datalist id="fin-sheet-categories">
        {categoryList.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table
            ref={gridRef}
            role="grid"
            aria-label="Transactions sheet"
            aria-rowcount={total + 2}
            aria-colcount={COLS.length + 1}
            className="w-full min-w-[1080px] border-collapse text-[14px]"
            onKeyDown={onGridKey}
          >
            <thead>
              <tr role="row" className="border-b border-line bg-surface-2">
                <th scope="col" className="w-10 px-2 py-2 text-left text-[11.5px] font-semibold text-fg-2">
                  #
                </th>
                {COLS.map((c) => (
                  <th key={c.key} scope="col" role="columnheader" className={cn("px-2 py-2 text-left text-[11.5px] font-semibold tracking-wide text-fg-2 uppercase", c.className)}>
                    {c.label}
                  </th>
                ))}
                <th scope="col" className="w-[72px] px-2 py-2">
                  <span className="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rows.map((t, r) => ({ t, r })), { t: null, r: rows.length }].map(({ t, r }) => {
                const newOne = t === null;
                return (
                  <tr key={t?.id ?? "new"} role="row" aria-rowindex={r + 2} className={cn("border-b border-line", newOne ? "bg-surface-2/60" : "hover:bg-surface-2/50")}>
                    <td className="px-2 text-[11.5px] text-fg-3 tabular-nums">{newOne ? <Plus className="h-3.5 w-3.5" aria-label="New row" /> : r + 1}</td>
                    {COLS.map((c, ci) => {
                      const isActive = active.r === r && active.c === ci;
                      const ro = readOnly(r, c.key);
                      const text = display(r, c.key, accountById);
                      return (
                        <td
                          key={c.key}
                          role="gridcell"
                          aria-selected={isActive}
                          aria-readonly={ro || undefined}
                          tabIndex={isActive && !editing ? 0 : -1}
                          ref={(el) => {
                            if (el) cellRefs.current.set(`${r}:${ci}`, el);
                            else cellRefs.current.delete(`${r}:${ci}`);
                          }}
                          onMouseDown={() => {
                            keepFocus.current = true;
                          }}
                          onClick={() => {
                            if (isActive && !editing) startEdit();
                            else if (!isActive) setActive({ r, c: ci });
                          }}
                          onDoubleClick={() => !editing && startEdit()}
                          className={cn(
                            "relative h-9 truncate px-2 outline-none",
                            c.className,
                            isActive && !editing && "ring-2 ring-primary ring-inset",
                            isActive && editing && "p-0",
                            ro && "text-fg-3",
                          )}
                        >
                          {isActive && editing ? (
                            renderEditor(r, c)
                          ) : newOne && !text ? (
                            <span className="text-fg-3">{c.key === "amount" ? "Amount" : c.key === "payee" ? "Add a row…" : c.key === "category" ? "Other" : ""}</span>
                          ) : (
                            <span className={cn(c.key === "amount" && !newOne && cn("font-medium tabular-nums", amountClass(t!.type)), c.key === "amount" && newOne && "tabular-nums")}>{text}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-1 text-right whitespace-nowrap">
                      {newOne ? (
                        <Button size="sm" variant="outline" onClick={() => void createFrom(newRow)} disabled={creating || !newRow.amount.trim()} aria-label="Add this row">
                          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                        </Button>
                      ) : (
                        <span className="inline-flex">
                          <Button variant="ghost" size="icon-sm" aria-label={`Open row ${r + 1}`} onClick={() => openTxDialog({ tx: items[r] })}>
                            <Expand className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete row ${r + 1}`} onClick={() => items[r] && void deleteTx(items[r]!)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr role="row" className="bg-surface-2 text-[12.5px]">
                  <td />
                  <td colSpan={5} className="px-2 py-2 font-semibold text-fg">
                    Totals · {totals.count} row{totals.count === 1 ? "" : "s"}
                    {hasMore ? ` (${rows.length} loaded)` : ""}
                  </td>
                  <td className="px-2 py-2 text-right text-fg-2">
                    <span className="block">Income</span>
                    <span className="block">Expense</span>
                    <span className="block font-semibold text-fg">Net</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className="block text-success">+{fmt(totals.income)}</span>
                    <span className="block text-danger">−{fmt(totals.expense)}</span>
                    <span className={cn("block font-semibold", totals.net >= 0 ? "text-success" : "text-danger")}>{fmt(totals.net, { sign: "always" })}</span>
                  </td>
                  <td colSpan={2} className="px-2 py-2 text-[12px] text-fg-2">
                    {totals.transfer > 0 ? `Transfers ${fmt(totals.transfer)} (not counted)` : ""}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {hasMore && (
          <div className="flex justify-center border-t border-line p-2">
            <Button variant="ghost" size="sm" onClick={loadMore} loading={loadingMore}>
              Load more rows
            </Button>
          </div>
        )}
      </Card>
      {!items.length && <p className="px-1 text-[13px] text-fg-2">No transactions in this view yet — type an amount in the last row and press Enter to add one.</p>}
    </div>
  );
}
