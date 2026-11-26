"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Archive, ArchiveRestore, Bell, BookOpen, CalendarDays, CheckSquare, Hourglass, Image as ImageIcon, Images, Loader2, Mountain, Repeat, RotateCcw, Shield, StickyNote, Target, Trash2, type LucideIcon } from "lucide-react";
import { api, refresh, useApi, SUMMARY_KEYS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, DemoBadge, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { pluralize } from "@/lib/utils";

type Mode = "archived" | "trash";
type TypeDef = { key: string; label: string; singular: string; api: string; icon: LucideIcon; archivable: boolean };

// Every module follows the shared soft-delete / archive contract in docs/CONVENTIONS.md.
const TYPES: TypeDef[] = [
  { key: "tasks", label: "Tasks", singular: "task", api: "/api/tasks", icon: CheckSquare, archivable: true },
  { key: "goals", label: "Goals", singular: "goal", api: "/api/goals", icon: Target, archivable: true },
  { key: "reminders", label: "Reminders", singular: "reminder", api: "/api/reminders", icon: Bell, archivable: true },
  { key: "events", label: "Events", singular: "event", api: "/api/events", icon: CalendarDays, archivable: false },
  { key: "habits", label: "Habits", singular: "habit", api: "/api/habits", icon: Repeat, archivable: true },
  { key: "notes", label: "Notes", singular: "note", api: "/api/notes", icon: StickyNote, archivable: true },
  { key: "vault", label: "Personal info", singular: "item", api: "/api/vault", icon: Shield, archivable: false },
  { key: "journal", label: "Journal entries", singular: "journal entry", api: "/api/journal", icon: BookOpen, archivable: true },
  { key: "memories", label: "Memories", singular: "memory", api: "/api/memories", icon: Images, archivable: true },
  { key: "photos", label: "Photos", singular: "photo", api: "/api/photos", icon: ImageIcon, archivable: false },
  { key: "bucket-list", label: "Bucket list", singular: "bucket list item", api: "/api/bucket-list", icon: Mountain, archivable: true },
  { key: "timeline", label: "Timeline events", singular: "timeline event", api: "/api/timeline", icon: Hourglass, archivable: false },
];

type Item = { id: string; title: string; isDemo: boolean; at: string | null };
type GroupState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: Item[] };

function normalize(raw: unknown, key: string, mode: Mode): Item[] {
  const r = raw as Record<string, unknown> | unknown[] | null;
  const list = (Array.isArray(r) ? r : (r?.items ?? r?.[key] ?? r?.data ?? [])) as Record<string, unknown>[];
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.id === "string")
    .map((x) => ({
      id: x.id as string,
      title: String(x.title || x.name || x.caption || (typeof x.entryDate === "string" ? `Untitled entry · ${x.entryDate}` : "Untitled")),
      isDemo: !!x.isDemo,
      at: (mode === "trash" ? x.deletedAt : x.archivedAt) as string | null,
    }));
}

export function RemovedItemsPage({ mode }: { mode: Mode }) {
  const types = useMemo(() => (mode === "archived" ? TYPES.filter((t) => t.archivable) : TYPES), [mode]);
  const [groups, setGroups] = useState<Record<string, GroupState>>({});
  const [emptying, setEmptying] = useState(false);
  const report = useCallback((key: string, s: GroupState) => setGroups((g) => ({ ...g, [key]: s })), []);

  const states = types.map((t) => groups[t.key] ?? { status: "loading" as const });
  const loading = states.some((s) => s.status === "loading");
  const total = states.reduce((n, s) => n + (s.status === "ready" ? s.items.length : 0), 0);
  const allEmpty = !loading && total === 0 && states.every((s) => s.status === "ready");

  const emptyTrash = async () => {
    const ok = await confirm({
      title: "Empty Recently Deleted?",
      body: `${pluralize(total, "item")} will be permanently deleted. This can't be undone.`,
      destructive: true,
      confirmLabel: "Delete permanently",
    });
    if (!ok) return;
    setEmptying(true);
    const jobs = types.flatMap((t) => {
      const s = groups[t.key];
      return s?.status === "ready" ? s.items.map((i) => api.delete(`${t.api}/${i.id}?permanent=1`)) : [];
    });
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === "rejected").length;
    await refresh(...types.map((t) => t.api), ...SUMMARY_KEYS);
    setEmptying(false);
    if (failed) toast.error(`${pluralize(failed, "item")} couldn't be deleted`);
    else toast.success("Recently Deleted is empty");
  };

  return (
    <div>
      <PageHeader
        title={mode === "archived" ? "Archived Items" : "Recently Deleted"}
        description={mode === "archived" ? "Things you've put away. Unarchive to bring them back." : "Deleted items stay here until you restore or permanently delete them."}
        actions={
          mode === "trash" && total > 0 ? (
            <Button variant="outline" onClick={emptyTrash} loading={emptying} className="text-danger">
              {!emptying && <Trash2 className="h-4 w-4" />} Empty trash
            </Button>
          ) : undefined
        }
      />
      {allEmpty && (
        <Card>
          <EmptyState
            icon={mode === "archived" ? Archive : Trash2}
            title={mode === "archived" ? "Nothing archived" : "Recently Deleted is empty"}
            description={mode === "archived" ? "Archive tasks, goals, notes, journal entries, memories and more to tidy up without losing them." : "When you delete something, it shows up here so you can restore it."}
          />
        </Card>
      )}
      {loading && total === 0 && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-14 w-full rounded-[14px]" />
          <Skeleton className="h-14 w-full rounded-[14px]" />
        </div>
      )}
      <div className="flex flex-col gap-6">
        {types.map((t) => (
          <Group key={t.key} type={t} mode={mode} onState={report} />
        ))}
      </div>
    </div>
  );
}

function Group({ type, mode, onState }: { type: TypeDef; mode: Mode; onState: (key: string, s: GroupState) => void }) {
  const { data, error } = useApi<unknown>(`${type.api}?scope=${mode}`, { shouldRetryOnError: false });
  const items = useMemo(() => (data === undefined ? null : normalize(data, type.key, mode)), [data, type.key, mode]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (items) onState(type.key, { status: "ready", items });
    else if (error) onState(type.key, { status: "error", message: error.message });
  }, [items, error, type.key, onState]);

  const done = () => refresh(type.api, ...SUMMARY_KEYS);
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const unarchive = (i: Item) =>
    run(i.id, async () => {
      await api.patch(`${type.api}/${i.id}`, { archived: false });
      await done();
      toast.success(`Unarchived "${i.title}"`);
    });
  const softDelete = (i: Item) =>
    run(i.id, async () => {
      await api.delete(`${type.api}/${i.id}`);
      await done();
      toast.undo(`"${i.title}" moved to Recently Deleted`, async () => {
        await api.patch(`${type.api}/${i.id}`, { deletedAt: null }).catch(toastError);
        done();
      });
    });
  const restore = (i: Item) =>
    run(i.id, async () => {
      await api.patch(`${type.api}/${i.id}`, { deletedAt: null });
      await done();
      toast.success(`Restored "${i.title}"`);
    });
  const destroy = (i: Item) =>
    run(i.id, async () => {
      const ok = await confirm({ title: `Delete this ${type.singular} permanently?`, body: `"${i.title}" will be gone for good. This can't be undone.`, destructive: true, confirmLabel: "Delete permanently" });
      if (!ok) return;
      await api.delete(`${type.api}/${i.id}?permanent=1`);
      await done();
      toast.success("Deleted permanently");
    });

  if (error && !items)
    return (
      <section>
        <GroupTitle type={type} />
        <p className="rounded-[10px] border border-dashed border-line px-4 py-3 text-[13px] text-fg-3">
          Couldn&apos;t load {type.label.toLowerCase()} right now{error.message ? ` (${error.message})` : ""}.
        </p>
      </section>
    );
  if (!items?.length) return null;

  const Icon = type.icon;
  return (
    <section>
      <GroupTitle type={type} count={items.length} />
      <Card className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <Icon className="h-4 w-4 shrink-0 text-fg-3" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium">{i.title}</span>
                <DemoBadge show={i.isDemo} />
              </div>
              {i.at && (
                <p className="text-[12px] text-fg-3">
                  {mode === "trash" ? "Deleted" : "Archived"} {formatDistanceToNow(new Date(i.at), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-end">
              {busy === i.id && <Loader2 className="h-4 w-4 animate-spin text-fg-3" />}
              {mode === "archived" ? (
                <>
                  <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => unarchive(i)}>
                    <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => softDelete(i)} className="text-danger hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => restore(i)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => destroy(i)} className="text-danger hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" /> Delete permanently
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function GroupTitle({ type, count }: { type: TypeDef; count?: number }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
      {type.label}
      {count !== undefined && <span className="text-[12px] font-normal text-fg-3">{count}</span>}
    </h2>
  );
}
