"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Box, CalendarHeart, Car, Check, Copy, Download, Eye, EyeOff, FileText, Lock, MapPin, MoreHorizontal, Pencil, Phone, Plus,
  Repeat, Search, Shield, ShieldCheck, Siren, Trash2, User, Users, type LucideIcon,
} from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Card, DemoBadge, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { downloadFromApi } from "@/components/settings/download";
import { cn, pluralize } from "@/lib/utils";
import { VAULT_CATEGORIES, type VaultCategory, type VaultField } from "./guard";
import { VaultItemDialog } from "./vault-item-dialog";

type ListField = VaultField & { hasValue: boolean };
type VaultItem = { id: string; category: VaultCategory; title: string; isDemo: boolean; deletedAt: string | null; updatedAt: string; fields: ListField[] };

export const VAULT_ICONS: Record<VaultCategory, LucideIcon> = {
  Profile: User,
  "Emergency contact": Siren,
  Phone: Phone,
  Address: MapPin,
  Family: Users,
  "Important date": CalendarHeart,
  Vehicle: Car,
  Insurance: ShieldCheck,
  Subscription: Repeat,
  Document: FileText,
  Custom: Box,
};

export function VaultView() {
  const params = useSearchParams();
  const focusId = params.get("id");
  const { data, error, isLoading } = useApi<{ items: VaultItem[] }>("/api/vault?scope=active");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<VaultCategory | "all">("all");
  const [dialog, setDialog] = useState<{ open: boolean; id: string | null; category?: VaultCategory }>({ open: false, id: null });
  const [highlight, setHighlight] = useState<string | null>(null);

  const items = data?.items;
  const counts = useMemo(() => {
    const m = new Map<VaultCategory, number>();
    items?.forEach((i) => m.set(i.category, (m.get(i.category) ?? 0) + 1));
    return m;
  }, [items]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((i) => (cat === "all" || i.category === cat) && (!needle || i.title.toLowerCase().includes(needle) || i.category.toLowerCase().includes(needle)));
  }, [items, q, cat]);

  const groups = useMemo(() => VAULT_CATEGORIES.map((c) => ({ category: c, items: visible.filter((i) => i.category === c) })).filter((g) => g.items.length), [visible]);

  // `/vault?id=` (from search) scrolls to and highlights the item.
  useEffect(() => {
    if (!focusId || !items?.some((i) => i.id === focusId)) return;
    setCat("all");
    setQ("");
    setHighlight(focusId);
    requestAnimationFrame(() => document.getElementById(`vault-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const h = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(h);
  }, [focusId, items]);

  const exportVault = async () => {
    try {
      await downloadFromApi("/api/vault/export", "mydiary-vault.json");
      toast.success("Vault exported — the file contains your decrypted data, keep it safe");
    } catch (err) {
      toastError(err);
    }
  };
  const deleteAll = async () => {
    const ok = await confirm({
      title: "Delete all vault data?",
      body: `This permanently deletes ${pluralize(items?.length ?? 0, "item")} (and anything in Recently Deleted from the vault). This can't be undone.`,
      destructive: true,
      confirmLabel: "Delete everything",
    });
    if (!ok) return;
    try {
      const res = await api.post<{ deleted: number }>("/api/vault/delete-all", { confirm: "DELETE" });
      refresh("/api/vault", ...SUMMARY_KEYS);
      toast.success(`Deleted ${pluralize(res.deleted, "item")}`);
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Personal Information"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-success" /> Encrypted at rest. Not for passwords or bank details — use a password manager for those.
          </span>
        }
        actions={
          <>
            <Menu
              trigger={
                <Button variant="outline" size="icon" aria-label="Vault options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                { label: "Export (JSON, decrypted)", icon: Download, onSelect: exportVault, disabled: !items?.length },
                { type: "separator" },
                { label: "Delete all vault data", icon: Trash2, danger: true, onSelect: deleteAll, disabled: !items?.length },
              ]}
            />
            <Button onClick={() => setDialog({ open: true, id: null, category: cat === "all" ? undefined : cat })}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </>
        }
      />

      {!!items?.length && (
        <div className="mb-5 flex flex-col gap-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or category" aria-label="Search personal information" className="pl-9" />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 scroll-thin">
            <Chip active={cat === "all"} onClick={() => setCat("all")} label="All" count={items.length} />
            {VAULT_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={c} count={counts.get(c)!} icon={VAULT_ICONS[c]} />
            ))}
          </div>
        </div>
      )}

      {error && !items ? (
        <Card className="p-6 text-sm text-danger">Couldn&apos;t load your vault. {error.message}</Card>
      ) : isLoading && !items ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-[14px]" />
          ))}
        </div>
      ) : !items?.length ? (
        <Card>
          <EmptyState
            icon={Shield}
            title="Keep important details in one place"
            description="Emergency contacts, addresses, vehicle and insurance details, subscriptions and document references — encrypted before they're stored."
            action={
              <Button onClick={() => setDialog({ open: true, id: null })}>
                <Plus className="h-4 w-4" /> Add your first item
              </Button>
            }
          />
        </Card>
      ) : !groups.length ? (
        <EmptyState icon={Search} title="Nothing matches" description="Try another title or category." />
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((g) => {
            const Icon = VAULT_ICONS[g.category];
            return (
              <section key={g.category} aria-label={g.category}>
                <h2 className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold">
                  <Icon className="h-4 w-4 text-fg-3" />
                  {g.category}
                  <span className="text-[12px] font-normal text-fg-3">{g.items.length}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {g.items.map((item) => (
                    <VaultCard key={item.id} item={item} highlight={highlight === item.id} onEdit={() => setDialog({ open: true, id: item.id })} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <VaultItemDialog open={dialog.open} id={dialog.id} initialCategory={dialog.category} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}

function Chip({ active, onClick, label, count, icon: Icon }: { active: boolean; onClick: () => void; label: string; count: number; icon?: LucideIcon }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
        active ? "border-primary/30 bg-primary-soft text-primary" : "border-line bg-surface text-fg-2 hover:text-fg",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      <span className="text-[11px] opacity-70 tabular-nums">{count}</span>
    </button>
  );
}

function VaultCard({ item, highlight, onEdit }: { item: VaultItem; highlight: boolean; onEdit: () => void }) {
  const [full, setFull] = useState<VaultField[] | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);

  // Never keep decrypted sensitive values around after the list changes.
  useEffect(() => {
    setFull(null);
    setRevealed(new Set());
  }, [item.updatedAt]);

  const loadFull = async () => {
    if (full) return full;
    const res = await api.get<{ item: { fields: VaultField[] } }>(`/api/vault/${item.id}`);
    setFull(res.item.fields);
    return res.item.fields;
  };
  const valueAt = async (i: number) => {
    const f = item.fields[i]!;
    if (!f.sensitive) return f.value;
    return (await loadFull())[i]?.value ?? "";
  };
  const toggleReveal = async (i: number) => {
    try {
      if (!revealed.has(i)) await loadFull();
      setRevealed((s) => {
        const n = new Set(s);
        if (n.has(i)) n.delete(i);
        else n.add(i);
        return n;
      });
    } catch (err) {
      toastError(err);
    }
  };
  const copy = async (i: number) => {
    try {
      await navigator.clipboard.writeText(await valueAt(i));
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch (err) {
      toastError(err instanceof Error && err.name === "NotAllowedError" ? new Error("Clipboard access was blocked") : err);
    }
  };
  const remove = async () => {
    try {
      await api.delete(`/api/vault/${item.id}`);
      refresh("/api/vault", ...SUMMARY_KEYS);
      toast.undo(`"${item.title}" moved to Recently Deleted`, async () => {
        await api.patch(`/api/vault/${item.id}`, { deletedAt: null }).catch(toastError);
        refresh("/api/vault", ...SUMMARY_KEYS);
      });
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Card id={`vault-${item.id}`} className={cn("flex flex-col p-4 transition-shadow duration-500", highlight && "ring-2 ring-primary/50")}>
      <div className="mb-2.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold">{item.title}</h3>
        </div>
        <DemoBadge show={item.isDemo} />
        <Menu
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${item.title}`} className="-mt-1 -mr-1">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={[
            { label: "Edit", icon: Pencil, onSelect: onEdit },
            { label: "Delete", icon: Trash2, danger: true, onSelect: remove },
          ]}
        />
      </div>
      {item.fields.length === 0 ? (
        <p className="text-[13px] text-fg-3">No fields yet.</p>
      ) : (
        <dl className="flex flex-col divide-y divide-line">
          {item.fields.map((f, i) => {
            const shown = !f.sensitive || revealed.has(i);
            const value = f.sensitive ? (shown ? (full?.[i]?.value ?? "") : "") : f.value;
            return (
              <div key={i} className="group flex items-center gap-3 py-1.5">
                <dt className="w-[38%] shrink-0 truncate text-[12.5px] text-fg-3">{f.label}</dt>
                <dd className={cn("min-w-0 flex-1 truncate text-[14px]", !f.hasValue && "text-fg-3")}>
                  {!f.hasValue ? "—" : shown ? value : <span className="tracking-[0.2em] text-fg-2" aria-label="Hidden value">••••••••</span>}
                </dd>
                {f.hasValue && (
                  <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
                    {f.sensitive && (
                      <Button variant="ghost" size="icon-sm" onClick={() => toggleReveal(i)} aria-label={shown ? `Hide ${f.label}` : `Reveal ${f.label}`}>
                        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => copy(i)} aria-label={`Copy ${f.label}`}>
                      {copied === i ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}
