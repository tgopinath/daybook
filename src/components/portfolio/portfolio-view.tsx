"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Download, ExternalLink, Globe, Link2, ListPlus, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import { parseAppLinks, type ParsedLink } from "@/lib/parse-app-links";
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

/**
 * Compose an email draft inside My Diary: To is left for the user, subject and message are
 * prefilled with the link. My Diary doesn't send mail itself — the draft opens in Gmail or the
 * user's mail app (or is copied), so it goes from their own account.
 */
export function EmailComposeDialog({
  open,
  onOpenChange,
  subject: initialSubject,
  body: initialBody,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subject: string;
  body: string;
}) {
  const { data: me } = useMe();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const signature = me?.user.name ? `\n\n${me.user.name.split(" ")[0]}` : "";
  const recipients = to
    .split(/[,;\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const badRecipient = recipients.find((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r));
  const toParam = recipients.join(",");

  const openGmail = () =>
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toParam)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      "_blank",
      "noopener",
    );
  const openMailApp = () => {
    window.location.href = `mailto:${encodeURIComponent(toParam).replace(/%2C/g, ",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setTo("");
          setSubject(initialSubject);
          setBody(initialBody + signature);
        }
        onOpenChange(o);
      }}
      title="Email"
      description="Add who it's for, adjust the message, then open the draft in your email."
      footer={
        <>
          <Button variant="ghost" onClick={() => void copyText(`${subject}\n\n${body}`, "Message")}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button variant="outline" onClick={openMailApp} disabled={!!badRecipient}>
            <Mail className="h-4 w-4" /> Mail app
          </Button>
          <Button onClick={openGmail} disabled={!!badRecipient}>
            <ExternalLink className="h-4 w-4" /> Open in Gmail
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="To" error={badRecipient ? `“${badRecipient}” doesn't look like an email address` : undefined} hint="Separate several addresses with commas. You can also leave it empty and add people in your email.">
          <Input type="text" inputMode="email" autoComplete="email" placeholder="name@example.com" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        </Field>
        <Field label="Subject">
          <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function ShareMenu({ title, url, text }: { title: string; url: string; text?: string }) {
  const message = text ? `${text}\n${url}` : `${title}\n${url}`;
  const [emailOpen, setEmailOpen] = useState(false);
  const emailBody = `Hi,\n\nI'd love for you to take a look at ${title}${text ? ` — ${text.replace(/\.$/, "")}` : ""}:\n${url}`;
  return (
    <>
    <EmailComposeDialog open={emailOpen} onOpenChange={setEmailOpen} subject={title} body={emailBody} />
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
        { label: "Email…", icon: Mail, onSelect: () => setEmailOpen(true) },
      ]}
    />
    </>
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
          <h1 className="font-display text-[22px] leading-tight font-semibold">My portfolio</h1>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[14px] break-all text-primary hover:underline">
              {host(url)}
            </a>
          ) : (
            <p className="text-[14px] text-fg-2">Add your portfolio or personal website to open, share and edit it from here.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover">
                <ExternalLink className="h-4 w-4" /> Open
              </a>
              {editUrl ? (
                <a href={editUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[14px] font-medium text-fg hover:bg-surface-2">
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

function BulkAddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedLink[] | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = (rows ?? []).filter((r) => r.name.trim() && /^https:\/\/\S+\.\S+/.test(r.url.trim()));

  const update = (i: number, patch: Partial<ParsedLink>) =>
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch, error: undefined } : r)));

  const add = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ added: number; skipped: number }>("/api/links/bulk", {
        items: valid.map((r) => ({ name: r.name.trim(), url: r.url.trim(), description: r.description.trim() || null })),
      });
      await refresh("/api/links");
      toast.success(res.skipped ? `Added ${res.added} apps · ${res.skipped} already saved` : `Added ${res.added} apps`);
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
          setText("");
          setRows(null);
        }
        onOpenChange(o);
      }}
      size="lg"
      title="Add several apps"
      description={rows ? "Check the names and links, then add them all." : "Paste one app per line. Any of these work: “Name - link”, “link Name”, “Name | link | description”, or just the link."}
      footer={
        rows ? (
          <>
            <Button variant="ghost" onClick={() => setRows(null)}>
              Back
            </Button>
            <Button onClick={add} loading={busy} disabled={!valid.length}>
              Add {valid.length} {valid.length === 1 ? "app" : "apps"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => setRows(parseAppLinks(text).slice(0, 50))} disabled={!text.trim()}>
              Review
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <Textarea
          rows={10}
          autoFocus
          aria-label="Apps, one per line"
          placeholder={"Word Wonders - https://example.com/word-wonders\nhttps://example.com/money-master Money Master\nhttps://example.com/kaadu"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-[14px]"
        />
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-fg-2">Nothing to add. Go back and paste some links.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const bad = !r.name.trim() || !/^https:\/\/\S+\.\S+/.test(r.url.trim());
            return (
              <li key={i} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_1.4fr]">
                    <Input value={r.name} maxLength={80} aria-label={`Name ${i + 1}`} placeholder="Name" onChange={(e) => update(i, { name: e.target.value })} />
                    <Input value={r.url} type="url" aria-label={`Link ${i + 1}`} placeholder="https://…" onChange={(e) => update(i, { url: e.target.value })} />
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${r.name || "row"}`} onClick={() => setRows((rs) => rs!.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {bad && <p className="mt-1.5 text-[12px] text-danger">{r.error ?? "Needs a name and a secure link starting with https://"}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

type ImportRow = { name: string; url: string; description: string; image: string | null; saved: boolean; pick: boolean };

/** Paste a projects or portfolio page link; every project card on it becomes an app you can pick. */
function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = (rows ?? []).filter((r) => r.pick);

  const read = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ apps: Omit<ImportRow, "pick">[] }>("/api/links/import", { url: url.trim() });
      setRows(res.apps.map((a) => ({ ...a, pick: !a.saved })));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ added: number; skipped: number }>("/api/links/bulk", {
        // Already-saved apps ride along so they can pick up the page's screenshot as their thumbnail.
        items: [...picked, ...(rows ?? []).filter((r) => r.saved && r.image)].map((r) => ({ name: r.name, url: r.url, description: r.description || null, imageUrl: r.image })),
      });
      await refresh("/api/links");
      toast.success(`Added ${res.added} ${res.added === 1 ? "app" : "apps"}`);
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
          setUrl("");
          setRows(null);
        }
        onOpenChange(o);
      }}
      size="lg"
      title="Import apps from a page"
      description={rows ? `Found ${rows.length} ${rows.length === 1 ? "project" : "projects"}. Pick the ones to add as cards.` : "Paste the link to a page that lists your projects, like your pet projects or portfolio page. Each project card becomes an app."}
      footer={
        rows ? (
          <>
            <Button variant="ghost" onClick={() => setRows(null)}>
              Back
            </Button>
            <Button onClick={add} loading={busy} disabled={!picked.length}>
              Add {picked.length} {picked.length === 1 ? "app" : "apps"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={read} loading={busy} disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())}>
              Find projects
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^https?:\/\/\S+\.\S+/.test(url.trim())) void read();
          }}
        >
          <Field label="Page link">
            <Input type="url" autoFocus placeholder="https://yourname.github.io/projects/" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </form>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-fg-2">No projects found on that page. Try a page that lists your apps with links, or use “Add several” to paste them.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-[14px]">
            <span className="text-fg-2">{picked.length} selected</span>
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setRows((rs) => rs!.map((r) => ({ ...r, pick: !r.saved && picked.length < rs!.filter((x) => !x.saved).length })))}
            >
              {picked.length < rows.filter((r) => !r.saved).length ? "Select all" : "Clear"}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.url}>
                <label className={`flex items-start gap-3 rounded-xl border p-3 ${r.pick ? "border-primary bg-primary-soft" : "border-line"} ${r.saved ? "opacity-70" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--primary)]"
                    checked={r.pick}
                    disabled={r.saved}
                    onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, pick: e.target.checked } : x)))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-fg">
                      {r.name}
                      {r.saved && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-normal text-fg-2">Already added</span>}
                    </span>
                    <span className="block truncate text-[12.5px] text-fg-2">{r.url.replace(/^https:\/\//, "").replace(/\/$/, "")}</span>
                    {r.description && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-fg-3">{r.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

/** An app's picture: a screenshot or share image fills the frame; an app icon sits centred; else its emoji. */
function AppThumb({ item }: { item: Link }) {
  const [failed, setFailed] = useState(false);
  const src = item.imageUrl && !failed ? item.imageUrl : null;
  const isIcon = !!src && /icon|favicon|logo|\.svg(\?|$)/i.test(src);
  return (
    <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-[10px] border border-line bg-surface-2" aria-hidden>
      {src ? (
        isIcon ? (
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-16 w-16 rounded-2xl object-contain shadow-sm" />
        ) : (
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]" />
        )
      ) : (
        <span className="text-[40px]">{item.emoji || "🔗"}</span>
      )}
    </div>
  );
}

function AppsSection() {
  const { data, isLoading } = useApi<{ items: Link[] }>("/api/links");
  const { data: me } = useMe();
  const [dialog, setDialog] = useState<{ open: boolean; item: Link | null }>({ open: false, item: null });
  const [copiedAll, setCopiedAll] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [emailOne, setEmailOne] = useState<Link | null>(null);
  const [emailAllOpen, setEmailAllOpen] = useState(false);
  // Apps saved without a picture get one looked up in the background (share image or app icon), a batch at a time.
  const missingThumbs = (data?.items ?? []).filter((l) => l.imageUrl === null).length;
  const [thumbRuns, setThumbRuns] = useState(0);
  useEffect(() => {
    if (!missingThumbs || thumbRuns >= 6) return;
    let live = true;
    api
      .post<{ checked: number }>("/api/links/thumbnails", {})
      .then(async (r) => {
        if (live && r.checked) await refresh("/api/links");
      })
      .catch(() => {})
      .finally(() => live && setThumbRuns((n) => n + 1));
    return () => {
      live = false;
    };
  }, [missingThumbs, thumbRuns]);
  const items = data?.items ?? [];
  // "New → App link" lands here with ?new=1
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("new") === "1") {
      setDialog({ open: true, item: null });
      sp.delete("new");
      window.history.replaceState(null, "", window.location.pathname + (sp.toString() ? `?${sp}` : ""));
    }
  }, []);

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
    if (!(await confirm({ title: `Remove ${item.name}?`, body: "This only removes the link from My Diary. The app itself isn't affected.", destructive: true, confirmLabel: "Remove" }))) return;
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
    <section aria-label="My apps">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {items.length > 1 && (
            <>
              <Button size="sm" variant="outline" onClick={() => void shareAll()}>
                {copiedAll ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} Share all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void copyText(allText(), "All app links")}>
                <Copy className="h-4 w-4" /> Copy all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEmailAllOpen(true)}>
                <Mail className="h-4 w-4" /> Email all
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4" /> Import from link
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <ListPlus className="h-4 w-4" /> Add several
          </Button>
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
          <EmptyState icon={Link2} title="Add the apps you've built" description="Keep every link in one place, ready to open or share with anyone." action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setDialog({ open: true, item: null })}>Add your first app</Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Download className="h-4 w-4" /> Import from a page
                </Button>
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  <ListPlus className="h-4 w-4" /> Paste several
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, i) => (
            <li key={item.id}>
              <Card className="group relative flex h-full flex-col overflow-hidden p-3 pb-4 transition-colors hover:border-primary/40 focus-within:border-primary/40">
                <AppThumb item={item} />
                <div className="mt-3 flex items-start gap-3 px-1">
                  <div className="min-w-0 flex-1">
                    {/* The whole card opens the app; the link's ::after stretches over it. */}
                    <h3 className="truncate text-[15px] font-semibold">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-[''] group-hover:text-primary focus-visible:after:ring-3 focus-visible:after:ring-primary/30"
                      >
                        {item.name}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </h3>
                    <p className="truncate text-[12.5px] text-fg-2">{host(item.url)}</p>
                  </div>
                  <div className="relative z-10">
                    <Menu
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`More for ${item.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                      items={[
                        { label: "Open", icon: ExternalLink, onSelect: () => window.open(item.url, "_blank", "noopener") },
                        { label: "Copy link", icon: Copy, onSelect: () => void copyText(item.url) },
                        { label: "Share…", icon: Share2, onSelect: () => void shareLink(item.name, item.url, item.description ?? undefined) },
                        { label: "WhatsApp", icon: MessageCircle, onSelect: () => window.open(`https://wa.me/?text=${encodeURIComponent(`${item.description ?? item.name}\n${item.url}`)}`, "_blank", "noopener") },
                        { label: "Email…", icon: Mail, onSelect: () => setEmailOne(item) },
                        { type: "separator" },
                        { label: "Edit", icon: Pencil, onSelect: () => setDialog({ open: true, item }) },
                        { label: "Move up", icon: ArrowUp, onSelect: () => void move(i, -1), disabled: i === 0 },
                        { label: "Move down", icon: ArrowDown, onSelect: () => void move(i, 1), disabled: i === items.length - 1 },
                        { type: "separator" },
                        { label: "Remove", icon: Trash2, onSelect: () => void remove(item), danger: true },
                      ]}
                    />
                  </div>
                </div>
                {item.description && <p className="mt-1.5 line-clamp-2 px-1 text-[13px] text-fg-2">{item.description}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <AppDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} initial={dialog.item} />
      <BulkAddDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <EmailComposeDialog
        open={!!emailOne}
        onOpenChange={(o) => !o && setEmailOne(null)}
        subject={emailOne?.name ?? ""}
        body={emailOne ? `Hi,\n\nI'd love for you to take a look at ${emailOne.name}${emailOne.description ? ` — ${emailOne.description.replace(/\.$/, "")}` : ""}:\n${emailOne.url}` : ""}
      />
      <EmailComposeDialog
        open={emailAllOpen}
        onOpenChange={setEmailAllOpen}
        subject={me?.user.name ? `${me.user.name.split(" ")[0]}'s apps` : "My apps"}
        body={`Hi,\n\nHere are the apps I've built — I'd love for you to try them:\n\n${items.map((i) => `• ${i.name}${i.description ? ` — ${i.description}` : ""}\n  ${i.url}`).join("\n")}${me?.settings.portfolioUrl ? `\n\nMore about my work: ${me.settings.portfolioUrl}` : ""}`}
      />
    </section>
  );
}

export function PortfolioView() {
  return (
    <div className="pt-2">
      <PortfolioCard />
    </div>
  );
}

export function AppsView() {
  return (
    <div>
      <PageHeader title="My apps" description="Open, share and keep track of the apps and sites you've made." />
      <AppsSection />
    </div>
  );
}
