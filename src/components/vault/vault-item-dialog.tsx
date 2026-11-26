"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Plus, X } from "lucide-react";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { VAULT_BLOCK_MESSAGE, VAULT_CATEGORIES, VAULT_TEMPLATES, fieldProblem, vaultProblem, type VaultCategory, type VaultField } from "./guard";

type Row = VaultField & { key: number };
let seq = 0;
const fromTemplate = (c: VaultCategory): Row[] => VAULT_TEMPLATES[c].map((t) => ({ key: ++seq, label: t.label, value: "", sensitive: !!t.sensitive }));

/** Create (id = null) or edit an item. Editing loads the decrypted item on open. */
export function VaultItemDialog({ open, onOpenChange, id, initialCategory }: { open: boolean; onOpenChange: (o: boolean) => void; id: string | null; initialCategory?: VaultCategory }) {
  const [category, setCategory] = useState<VaultCategory>(initialCategory ?? "Profile");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setShown(new Set());
    setTouched(false);
    if (!id) {
      const c = initialCategory ?? "Profile";
      setCategory(c);
      setTitle("");
      setRows(fromTemplate(c));
      return;
    }
    setLoading(true);
    api
      .get<{ item: { category: VaultCategory; title: string; fields: VaultField[] } }>(`/api/vault/${id}`)
      .then(({ item }) => {
        setCategory(item.category);
        setTitle(item.title);
        setRows(item.fields.map((f) => ({ ...f, key: ++seq })));
      })
      .catch((err) => {
        toastError(err);
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeCategory = (c: VaultCategory) => {
    setCategory(c);
    // Swap in the new template while the user hasn't typed any values yet.
    if (!id && rows.every((r) => !r.value.trim())) setRows(fromTemplate(c));
  };
  const update = (key: number, patch: Partial<VaultField>) => {
    setTouched(true);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const fields = rows.filter((r) => r.label.trim() || r.value.trim()).map(({ label, value, sensitive }) => ({ label: label.trim(), value, sensitive }));
  const problem = vaultProblem(title, fields);
  const missingLabel = fields.some((f) => !f.label);

  const save = async () => {
    if (!title.trim()) return toast.error("Enter a title");
    if (problem || missingLabel) return;
    setBusy(true);
    try {
      if (id) await api.patch(`/api/vault/${id}`, { category, title: title.trim(), fields });
      else await api.post("/api/vault", { category, title: title.trim(), fields });
      refresh("/api/vault", ...SUMMARY_KEYS);
      toast.success(id ? "Saved" : "Added to your vault");
      onOpenChange(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={id ? "Edit item" : "Add personal information"}
      description="Fields are encrypted before they're stored."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={loading || !title.trim() || !!problem || missingLabel}>
            {id ? "Save" : "Add item"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Field label="Category">
              <Select value={category} onChange={(e) => changeCategory(e.target.value as VaultCategory)}>
                {VAULT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={placeholderFor(category)} autoFocus={!id} />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-fg-2">Fields</span>
              <span className="text-[11.5px] text-fg-3">Mark a field sensitive to mask it</span>
            </div>
            {rows.map((r) => {
              const warn = (touched || id) && (r.label || r.value) ? fieldProblem(r.label, r.value) : null;
              const visible = !r.sensitive || shown.has(r.key);
              return (
                <div key={r.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Input value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} placeholder="Label" aria-label="Field label" maxLength={60} className="w-[34%] min-w-0 text-[14px]" />
                    <div className="relative min-w-0 flex-1">
                      <Input
                        value={r.value}
                        onChange={(e) => update(r.key, { value: e.target.value })}
                        placeholder="Value"
                        aria-label={`${r.label || "Field"} value`}
                        maxLength={2000}
                        type={visible ? "text" : "password"}
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        className={cn("text-[14px]", r.sensitive && "pr-8", warn && "border-danger focus:border-danger focus:ring-danger/15")}
                      />
                      {r.sensitive && (
                        <button
                          type="button"
                          onClick={() => setShown((s) => new Set(s.has(r.key) ? [...s].filter((k) => k !== r.key) : [...s, r.key]))}
                          className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-3 hover:text-fg"
                          aria-label={visible ? "Hide value" : "Show value"}
                        >
                          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => update(r.key, { sensitive: !r.sensitive })}
                      aria-pressed={r.sensitive}
                      title={r.sensitive ? "Sensitive — masked in the list" : "Mark as sensitive"}
                      className={cn("h-9 shrink-0 rounded-[10px] border px-2 text-[11.5px] font-medium transition-colors", r.sensitive ? "border-primary/30 bg-primary-soft text-primary" : "border-line text-fg-3 hover:text-fg")}
                    >
                      Sensitive
                    </button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove field">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {warn && <p className="pl-1 text-[12px] text-danger">{warn}</p>}
                </div>
              );
            })}
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, { key: ++seq, label: "", value: "", sensitive: false }])}>
              <Plus className="h-3.5 w-3.5" /> Add field
            </Button>
          </div>

          {(problem || missingLabel) && (touched || !!id || !!title) && (
            <div role="alert" className="flex gap-2 rounded-[10px] border border-danger/30 bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{missingLabel && !problem ? "Every field with a value needs a label." : `${VAULT_BLOCK_MESSAGE}. ${problem}`}</span>
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}

function placeholderFor(c: VaultCategory) {
  const map: Partial<Record<VaultCategory, string>> = {
    Profile: "Me",
    "Emergency contact": "e.g. Priya (sister)",
    Phone: "e.g. Family doctor",
    Address: "e.g. Home",
    Family: "e.g. Dad",
    "Important date": "e.g. Wedding anniversary",
    Vehicle: "e.g. Hyundai i20",
    Insurance: "e.g. Health insurance",
    Subscription: "e.g. Netflix",
    Document: "e.g. Passport",
  };
  return map[c] ?? "Title";
}
