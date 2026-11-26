"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";
import { POPULAR_CURRENCIES, allCurrencies, currencyName, currencySymbol, formatMoney } from "@/lib/money";
import { create } from "@/components/ui/store";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { refreshFinance, useFinanceSettings } from "./use-finance";

const store = create<{ open: boolean }>({ open: false });
export const openFinanceSettings = () => store.set({ open: true });

export function FinanceSettingsHost() {
  const { open } = store.use();
  const { data } = useFinanceSettings();
  const [currency, setCurrency] = useState("INR");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && data) setCurrency(data.currency);
  }, [open, data]);

  const options = useMemo(() => {
    const all = allCurrencies();
    const popular = POPULAR_CURRENCIES.filter((c) => all.includes(c));
    return { popular, rest: all.filter((c) => !popular.includes(c)) };
  }, []);
  const changed = !!data && currency !== data.currency;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/finance/settings", { currency });
      await refreshFinance();
      toast.success(`Amounts now show in ${currency}`);
      store.set({ open: false });
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const label = (c: string) => `${c} — ${currencyName(c)} (${currencySymbol(c)})`;
  const sheets = data?.sheets;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => store.set({ open: o })}
      title="Finance settings"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => store.set({ open: false })}>
            Close
          </Button>
          <Button onClick={save} loading={saving} disabled={!changed}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Currency" hint={`Example: ${formatMoney(125050, currency)}`}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <optgroup label="Popular">
              {options.popular.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </optgroup>
            <optgroup label="All currencies">
              {options.rest.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        {changed && (
          <div className="flex gap-2 rounded-[10px] bg-warning-soft p-3 text-[13px] text-fg" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
            <p>
              Changing the currency only changes the symbol. Existing amounts are <strong>not converted</strong> — {formatMoney(125050, data!.currency)} will show as {formatMoney(125050, currency)}.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-[13px] font-medium text-fg-2">Google Sheets export</h3>
          {sheets?.available ? (
            <p className="mt-1 flex items-start gap-1.5 text-[13px] text-fg-2">
              {sheets.connected ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : null}
              {sheets.connected
                ? "Connected. My Diary can create new spreadsheets in your Drive (it can't see your other files)."
                : "Not connected yet. The first export asks Google for permission to create files — My Diary can only see files it creates."}
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-fg-2">{sheets?.message ?? "Checking…"}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
