"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Globe, Link2, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import type { AppLink } from "@prisma/client";
import { api, refresh, useApi, type Wire } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";

type Link = Wire<AppLink>;

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

async function copyText(text: string, what = "Link") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select the link and copy it manually.");
  }
}

/** Native share sheet where available (phones), otherwise copy. */
async function shareLink(title: string, url: string, text?: string) {
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }
  await copyText(url);
}

function ShareMenu({ title, url, text }: { title: string; url: string; text?: string }) {
  const message = text ? `${text}\n${url}` : `${title}\n${url}`;
  return (
    <Menu
      trigger={
        <Button size="sm" variant="outline" aria-label={`Share ${title}`}>
          <Share2 className="h-4 w-4" /> Share
        </Button>
      }
      items={[
        { label: "Share…", icon: Share2, onSelect: () => void shareLink(title, url, text) },
        { label: "Copy link", icon: Copy, onSelect: () => void copyText(url) },
        { label: "WhatsApp", icon: MessageCircle, onSelect: () => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener") },
        { label: "Email", icon: Mail, onSelect: () => (window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`) },
      ]}
    />
  );
}

// ---------------------------------------------------------------- portfolio

function PortfolioCard() {
  const { data: me, mutate } = useMe();
  const url = me?.settings.portfolioUrl ?? null;
  const editUrl = me?.settings.portfolioEditUrl ?? null;
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(true);
  const name = me?.user.name ?? "My";

  if (!me) return <Skeleton className="h-40 w-full" />;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Globe className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[19px] font-semibold">My portfolio</h2>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] break-all text-primary hover:underline">
              {host(url)}
            </a>
          ) : (
            <p className="text-[13.5px] text-fg-2">Add your portfolio or personal website to open, share and edit it from here.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover">
                <ExternalLink className="h-4 w-4" /> Open
              </a>
              {editUrl ? (
                <a href={editUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fg hover:bg-surface-2">
                  <Pencil className="h-4 w-4" /> Edit portfolio
                </a>
              ) : null}
              <ShareMenu title={`${name.split(" ")[0]}'s portfolio`} url={url} />
            </>
          )}
          <Button size="sm" variant={url ? "ghost" : "primary"} onClick={() => setEditing(true)}>
            {url ? "Change links" : (
              <>
                <Plus className="h-4 w-4" /> Add portfolio
              </>
            )}
          </Button>
        </div>
      </div>

      {url && (
        <div className="border-t border-line">
          <div className="flex items-center justify-between px-5 py-2">
            <span className="text-[12.5px] text-fg-2">Preview</span>
            <button onClick={() => setPreview((p) => !p)} className="text-[12.5px] font-medium text-primary hover:underline">
              {preview ? "Hide preview" : "Show preview"}
            </button>
          </div>
          {preview && (
            <div className="px-5 pb-5">
              <iframe
                src={url}
                title="Portfolio preview"
                className="h-[62vh] min-h-[360px] w-full rounded-xl border border-line bg-white"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <p className="mt-2 text-[12px] text-fg-3">Blank? Some sites don&apos;t allow being shown inside other apps. Use Open instead.</p>
            </div>
          )}
        </div>
      )}

      <PortfolioDialog
        open={editing}
        onOpenChange={setEditing}
        initial={{ url: url ?? "", editUrl: editUrl ?? "" }}
        onSaved={(patch) => mutate((m) => (m ? { ...m, settings: { ...m.settings, ...patch } } : m), { revalidate: true })}
      />
    </Card>
  );
}

function PortfolioDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: { url: string; editUrl: string };
  onSaved: (patch: { portfolioUrl: string | null; portfolioEditUrl: string | null }) => void;
}) {
  const [url, setUrl] = useState(initial.url);
  const [editUrl, setEditUrl] = useState(initial.editUrl);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const patch = { portfolioUrl: url.trim() || null, portfolioEditUrl: editUrl.trim() || null };
      await api.patch("/api/settings", patch);
      onSaved(patch);
      toast.success("Portfolio links saved");
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
      onOpenChange={(o) => {
        if (o) {
          setUrl(initial.url);
          setEditUrl(initial.editUrl);
        }
        onOpenChange(o);
      }}
      title="Portfolio links"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Portfolio link" hint="The public address of your portfolio or website.">
          <Input type="url" inputMode="url" placeholder="https://yourname.github.io/portfolio/" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        </Field>
        <Field label="Edit link (optional)" hint="Where you edit it. For a GitHub Pages site, use github.dev/<you>/<repo> to edit in the browser and publish with a commit.">
          <Input type="url" inputMode="url" placeholder="https://github.dev/yourname/portfolio" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- apps

function AppDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: Link | null }) {
  const [form, setForm] = useState({ name: "", url: "", description: "", emoji: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const payload = { name: form.name, url: form.url, description: form.description || null, emoji: form.emoji || null };
      if (initial) await api.patch(`/api/links/${initial.id}`, payload);
      else await api.post("/api/links", payload);
      await refresh("/api/links");
      toast.success(initial ? "App updated" : "App added");
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
      onOpenChange={(o) => {
        if (o) setForm({ name: initial?.name ?? "", url: initial?.url ?? "", description: initial?.description ?? "", emoji: initial?.emoji ?? "" });
        onOpenChange(o);
      }}
      title={initial ? "Edit app" : "Add an app"}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!form.name.trim() || !form.url.trim()}>
            {initial ? "Save" : "Add app"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-[72px_1fr] gap-3">
          <Field label="Icon">
            <Input value={form.emoji} maxLength={8} placeholder="🚀" aria-label="Emoji icon" className="text-center text-[18px]" onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </Field>
          <Field label="Name">
            <Input value={form.name} maxLength={80} placeholder="e.g. Word Wonders" onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
        </div>
        <Field label="Link">
          <Input type="url" inputMode="url" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </Field>
        <Field label="Short description (optional)">
          <Textarea rows={2} maxLength={240} placeholder="What it does, in a sentence" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </form>
    </Dialog>
  );
}

function AppsSection() {
  const { data, isLoading } = useApi<{ items: Link[] }>("/api/links");
  const { data: me } = useMe();
  const [dialog, setDialog] = useState<{ open: boolean; item: Link | null }>({ open: false, item: null });
  const [copiedAll, setCopiedAll] = useState(false);
  const items = data?.items ?? [];

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...items];
    const [it] = next.splice(index, 1);
    next.splice(index + dir, 0, it!);
    try {
      await api.post("/api/links/reorder", { ids: next.map((i) => i.id) });
      await refresh("/api/links");
    } catch (err) {
      toastError(err);
    }
  };

  const remove = async (item: Link) => {
    if (!(await confirm({ title: `Remove ${item.name}?`, body: "This only removes the link from MyDiary. The app itself isn't affected.", destructive: true, confirmLabel: "Remove" }))) return;
    try {
      await api.delete(`/api/links/${item.id}`);
      await refresh("/api/links");
      toast.success("Removed");
    } catch (err) {
      toastError(err);
    }
  };

  const allText = () => {
    const first = me?.user.name?.split(" ")[0];
    const lines = items.map((i) => `${i.emoji ? `${i.emoji} ` : ""}${i.name}: ${i.url}`);
    const portfolio = me?.settings.portfolioUrl ? `\nPortfolio: ${me.settings.portfolioUrl}` : "";
    return `${first ? `${first}'s apps` : "My apps"}\n${lines.join("\n")}${portfolio}`;
  };

  const shareAll = async () => {
    const text = allText();
    if ("share" in navigator) {
      try {
        await navigator.share({ title: "My apps", text });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    await copyText(text, "All app links");
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <section aria-labelledby="apps-title" className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="apps-title" className="font-display text-[19px] font-semibold">
            My apps
          </h2>
          <p className="text-[13.5px] text-fg-2">Open, copy or share links to the apps and sites you&apos;ve made.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length > 1 && (
            <>
              <Button size="sm" variant="outline" onClick={() => void shareAll()}>
                {copiedAll ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} Share all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void copyText(allText(), "All app links")}>
                <Copy className="h-4 w-4" /> Copy all
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="h-4 w-4" /> Add app
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Link2} title="Add the apps you've built" description="Keep every link in one place, ready to open or share with anyone." action={<Button onClick={() => setDialog({ open: true, item: null })}>Add your first app</Button>} />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, i) => (
            <li key={item.id}>
              <Card className="flex h-full flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[22px]" aria-hidden>
                    {item.emoji || "🔗"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold">{item.name}</h3>
                    <p className="truncate text-[12.5px] text-fg-2">{host(item.url)}</p>
                  </div>
                  <Menu
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label={`More for ${item.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                    items={[
                      { label: "Edit", icon: Pencil, onSelect: () => setDialog({ open: true, item }) },
                      { label: "Move up", icon: ArrowUp, onSelect: () => void move(i, -1), disabled: i === 0 },
                      { label: "Move down", icon: ArrowDown, onSelect: () => void move(i, 1), disabled: i === items.length - 1 },
                      { type: "separator" },
                      { label: "Remove", icon: Trash2, onSelect: () => void remove(item), danger: true },
                    ]}
                  />
                </div>
                {item.description && <p className="mt-2 line-clamp-2 text-[13px] text-fg-2">{item.description}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover">
                    <ExternalLink className="h-4 w-4" /> Open
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => void copyText(item.url)}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                  <ShareMenu title={item.name} url={item.url} text={item.description ?? undefined} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <AppDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} initial={dialog.item} />
    </section>
  );
}

export function PortfolioView() {
  return (
    <div>
      <PageHeader title="My portfolio & apps" description="Your portfolio and everything you've built, ready to open, edit or share." />
      <PortfolioCard />
      <AppsSection />
    </div>
  );
}
