"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Archive, Download, FileUp, Sparkles, Trash2 } from "lucide-react";
import { api, refresh } from "@/lib/client";
import type { Me } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { pluralize } from "@/lib/utils";
import { downloadFromApi } from "./download";
import { Row, Section } from "./shared";

type Summary = Record<string, number>;
const SUMMARY_LABELS: [string, string, string][] = [
  ["tasks", "task", "tasks"],
  ["subtasks", "subtask", "subtasks"],
  ["goals", "goal", "goals"],
  ["milestones", "milestone", "milestones"],
  ["reminders", "reminder", "reminders"],
  ["events", "event", "events"],
  ["habits", "habit", "habits"],
  ["habitEntries", "habit check-in", "habit check-ins"],
  ["notes", "note", "notes"],
  ["vault", "personal info item", "personal info items"],
  ["categories", "category", "categories"],
  ["projects", "project", "projects"],
  ["tags", "tag", "tags"],
];

export function DataSection({ me }: { me: Me }) {
  const [exporting, setExporting] = useState<"export" | "backup" | null>(null);
  const [importState, setImportState] = useState<{ data: unknown; summary: Summary; fileName: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async (kind: "export" | "backup") => {
    setExporting(kind);
    try {
      const name = await downloadFromApi(kind === "backup" ? "/api/account/export?backup=1" : "/api/account/export", `mydiary-${kind}.json`);
      toast.success(`Downloaded ${name}`);
    } catch (err) {
      toastError(err);
    } finally {
      setExporting(null);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast.error("That file is too large (25 MB max)");
    setChecking(true);
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't valid JSON");
      }
      const res = await api.post<{ summary: Summary }>("/api/account/import?dryRun=1", data);
      setImportState({ data, summary: res.summary, fileName: file.name });
    } catch (err) {
      toastError(err);
    } finally {
      setChecking(false);
    }
  };

  const runImport = async () => {
    if (!importState) return;
    setImporting(true);
    try {
      const res = await api.post<{ summary: Summary }>("/api/account/import", importState.data);
      setImportState(null);
      await refresh();
      const n = SUMMARY_LABELS.filter(([k]) => ["tasks", "goals", "reminders", "events", "habits", "notes", "vault"].includes(k)).reduce((a, [k]) => a + (res.summary[k] ?? 0), 0);
      toast.success(`Imported ${pluralize(n, "item")}`);
    } catch (err) {
      toastError(err);
    } finally {
      setImporting(false);
    }
  };

  const clearDemo = async () => {
    const ok = await confirm({
      title: "Remove sample data?",
      body: "All tasks, goals, reminders, events, habits, notes and personal info marked as Demo will be permanently deleted. Your own items stay.",
      destructive: true,
      confirmLabel: "Remove sample data",
    });
    if (!ok) return;
    setClearing(true);
    try {
      await api.post("/api/account/clear-demo");
      await refresh();
      toast.success("Sample data removed");
    } catch (err) {
      toastError(err);
    } finally {
      setClearing(false);
    }
  };

  const rows = importState ? SUMMARY_LABELS.filter(([k]) => (importState.summary[k] ?? 0) > 0) : [];

  return (
    <Section id="data" title="Data management" description="Your data is yours. Take it with you or remove it at any time.">
      <Row label="Export all data" hint="One JSON file with everything you've added, including decrypted personal info. Store it somewhere safe.">
        <Button variant="outline" size="sm" onClick={() => download("export")} loading={exporting === "export"}>
          {exporting !== "export" && <Download className="h-3.5 w-3.5" />} Export JSON
        </Button>
      </Row>
      <Row label="Backup" hint="Same as export, saved with a date-and-time stamped filename so backups don't overwrite each other.">
        <Button variant="outline" size="sm" onClick={() => download("backup")} loading={exporting === "backup"}>
          {exporting !== "backup" && <Archive className="h-3.5 w-3.5" />} Download backup
        </Button>
      </Row>
      <Row label="Import data" hint="Add items from a MyDiary export. They're added as new items — nothing you have now is overwritten.">
        <>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={checking}>
            {!checking && <FileUp className="h-3.5 w-3.5" />} Choose file…
          </Button>
        </>
      </Row>
      {me.hasDemoData && (
        <Row label="Sample data" hint="Remove the example tasks, goals, notes and more that came with your account.">
          <Button variant="outline" size="sm" onClick={clearDemo} loading={clearing}>
            {!clearing && <Sparkles className="h-3.5 w-3.5" />} Remove sample data
          </Button>
        </Row>
      )}
      <Row label={<span className="text-danger">Delete account</span>} hint="Permanently deletes your account and everything in it. This can't be undone.">
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" /> Delete account
        </Button>
      </Row>

      <Dialog
        open={!!importState}
        onOpenChange={(o) => !o && !importing && setImportState(null)}
        size="sm"
        title="Import this file?"
        description={importState?.fileName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportState(null)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={runImport} loading={importing} disabled={!rows.length}>
              Import
            </Button>
          </>
        }
      >
        {rows.length ? (
          <div className="flex flex-col gap-3 text-[13.5px]">
            <p className="text-fg-2">These will be added to your account as new items:</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {rows.map(([k, one, many]) => (
                <li key={k} className="flex justify-between gap-2 border-b border-dashed border-line pb-1">
                  <span className="text-fg-2 capitalize">{many}</span>
                  <span className="font-medium tabular-nums">{importState!.summary[k]}</span>
                  <span className="sr-only">{importState!.summary[k] === 1 ? one : many}</span>
                </li>
              ))}
            </ul>
            {(importState?.summary.vaultSkipped ?? 0) > 0 && (
              <p className="flex gap-2 rounded-[10px] bg-warning-soft px-3 py-2 text-[12.5px] text-warning-text">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {pluralize(importState!.summary.vaultSkipped!, "personal info item")} will be skipped because they look like passwords or financial credentials.
              </p>
            )}
            <p className="text-[12.5px] text-fg-3">Existing categories, projects and tags with the same name are reused.</p>
          </div>
        ) : (
          <p className="text-sm text-fg-2">This file doesn&apos;t contain anything to import.</p>
        )}
      </Dialog>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} email={me.user.email} needsPassword={me.account?.hasPassword ?? true} />
    </Section>
  );
}

function DeleteAccountDialog({ open, onOpenChange, email, needsPassword }: { open: boolean; onOpenChange: (o: boolean) => void; email: string; needsPassword: boolean }) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTyped("");
      setPassword("");
    }
  }, [open]);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  const submit = async () => {
    if (!matches || (needsPassword && !password)) return;
    setBusy(true);
    try {
      await api.post("/api/account/delete", { email: typed.trim(), ...(needsPassword ? { password } : {}) });
      window.location.href = "/signup";
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      size="sm"
      title="Delete your account?"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!matches || (needsPassword && !password)}>
            Delete account forever
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-[13.5px] leading-relaxed text-fg-2">
          Every task, goal, reminder, event, habit, note, personal info item and conversation will be permanently deleted. Consider exporting your data first.
        </p>
        <Field label={`Type ${email} to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Field>
        {needsPassword && (
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
