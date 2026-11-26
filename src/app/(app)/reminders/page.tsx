"use client";
import { useMemo, useState } from "react";
import { AlarmClock, Archive, BellRing, ChevronDown, History, Plus, Repeat } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { useTz } from "@/lib/use-me";
import { addDaysKey, dayKey } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Segmented, SkeletonList } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useCreateParam } from "@/lib/use-create-param";
import type { WireNotification } from "@/components/notifications/notification-center";
import { PermissionBanner } from "./_components/permission-banner";
import { ReminderDialog, refreshReminders } from "./_components/reminder-dialog";
import { ReminderRow } from "./_components/reminder-row";
import { KINDS, PRESETS, draftToPayload, emptyDraft, fmtWhen, kindMeta, type Draft, type Kind, type WireReminder } from "./_components/meta";

type Tab = "active" | "archived" | "history";

function Section({ title, count, children, action, icon: Icon }: { title: string; count?: number; children: React.ReactNode; action?: React.ReactNode; icon?: typeof BellRing }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          {Icon && <Icon className="h-4 w-4 text-fg-3" />}
          {title}
          {count !== undefined && <span className="text-[12px] font-normal text-fg-3 tabular-nums">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SubGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <h3 className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{label}</h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function isDue(r: WireReminder, now: number) {
  if (r.status !== "ACTIVE") return false;
  const snoozed = r.snoozedUntil ? new Date(r.snoozedUntil).getTime() : null;
  if (snoozed && snoozed > now) return false;
  if (snoozed && snoozed <= now) return true; // about to re-fire
  const at = new Date(r.remindAt).getTime();
  if (r.recurrence === "NONE") return at <= now;
  // Recurring: due only while an occurrence is pending dispatch, or a finished series.
  return at <= now;
}

function History_({ tz }: { tz: string }) {
  const { data, error, isLoading } = useApi<{ items: WireNotification[] }>("/api/notifications?type=REMINDER&limit=100");
  if (isLoading && !data) return <SkeletonList rows={6} />;
  if (error && !data) return <p className="px-1 py-6 text-sm text-danger">Couldn&apos;t load history: {error instanceof Error ? error.message : "error"}</p>;
  const items = data?.items ?? [];
  if (!items.length)
    return (
      <Card>
        <EmptyState icon={History} title="No reminders have fired yet" description="Every time a reminder goes off it's logged here, with the time it was delivered." />
      </Card>
    );
  const groups = new Map<string, WireNotification[]>();
  for (const n of items) {
    const k = dayKey(new Date(n.createdAt), tz);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const today = dayKey(new Date(), tz);
  const label = (k: string) =>
    k === today
      ? "Today"
      : k === addDaysKey(today, -1)
        ? "Yesterday"
        : new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${k}T12:00:00Z`));
  return (
    <Card className="p-1.5">
      {[...groups].map(([k, list]) => (
        <SubGroup key={k} label={label(k)}>
          {list.map((n) => (
            <li key={n.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2">
              <span className="w-[68px] shrink-0 text-[12px] text-fg-3 tabular-nums">
                {new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(n.createdAt))}
              </span>
              <AlarmClock className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{n.title}</span>
                {n.body && <span className="block truncate text-[12px] text-fg-3">{n.body}</span>}
              </span>
              <span className="hidden text-[11.5px] text-fg-3 sm:inline">{n.delivered ? "Pushed to device" : "In-app only"}</span>
              {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            </li>
          ))}
        </SubGroup>
      ))}
    </Card>
  );
}

export default function RemindersPage() {
  const tz = useTz();
  const [tab, setTab] = useState<Tab>("active");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [dialog, setDialog] = useState<{ open: boolean; reminder: WireReminder | null; initial?: Partial<Draft> }>({ open: false, reminder: null });
  const [showCompleted, setShowCompleted] = useState(false);

  const { data, error, isLoading } = useApi<{ items: WireReminder[] }>("/api/reminders", { refreshInterval: 30_000 });
  const archived = useApi<{ items: WireReminder[] }>(tab === "archived" ? "/api/reminders?scope=archived" : null);

  const openNew = (initial?: Partial<Draft>) => setDialog({ open: true, reminder: null, initial });
  const openEdit = (r: WireReminder) => setDialog({ open: true, reminder: r });
  // /reminders?new=1 (the "New" menu, My space) opens a blank reminder.
  useCreateParam("new", () => openNew());

  const quickCreate = async (p: (typeof PRESETS)[number]) => {
    const draft = { ...emptyDraft(tz), ...p.draft(tz) };
    if (!p.instant) return openNew(draft);
    try {
      const res = await api.post<{ item: WireReminder }>("/api/reminders", draftToPayload(draft, tz));
      toast.undo(`“${draft.title}” starts ${fmtWhen(new Date(res.item.remindAt), tz)}`, () =>
        api.delete(`/api/reminders/${res.item.id}?permanent=1`).then(() => refreshReminders(), toastError),
      );
      void refreshReminders();
    } catch (err) {
      toastError(err);
    }
  };

  const sections = useMemo(() => {
    const now = Date.now();
    const all = (data?.items ?? []).filter((r) => kind === "all" || r.kind === kind);
    const today = dayKey(new Date(), tz);
    const tomorrow = addDaysKey(today, 1);
    const weekEnd = addDaysKey(today, 7);
    const due: WireReminder[] = [];
    const recurring: WireReminder[] = [];
    const completed: WireReminder[] = [];
    const upcoming = { Today: [] as WireReminder[], Tomorrow: [] as WireReminder[], "This week": [] as WireReminder[], Later: [] as WireReminder[] };
    for (const r of all) {
      if (r.status === "COMPLETED") completed.push(r);
      else if (isDue(r, now)) due.push(r);
      else if (r.recurrence !== "NONE" && !(r.snoozedUntil && new Date(r.snoozedUntil).getTime() > now)) recurring.push(r);
      else {
        const at = r.snoozedUntil && new Date(r.snoozedUntil).getTime() > now ? new Date(r.snoozedUntil) : new Date(r.remindAt);
        const k = dayKey(at, tz);
        if (k === today) upcoming.Today.push(r);
        else if (k === tomorrow) upcoming.Tomorrow.push(r);
        else if (k < weekEnd) upcoming["This week"].push(r);
        else upcoming.Later.push(r);
      }
    }
    const effective = (r: WireReminder) => new Date(r.snoozedUntil && new Date(r.snoozedUntil).getTime() > now ? r.snoozedUntil : r.remindAt).getTime();
    Object.values(upcoming).forEach((l) => l.sort((a, b) => effective(a) - effective(b)));
    completed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const upcomingCount = Object.values(upcoming).reduce((n, l) => n + l.length, 0);
    return { due, recurring, completed, upcoming, upcomingCount, total: all.length };
  }, [data, kind, tz]);

  const kindCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.items ?? []) if (r.status === "ACTIVE") m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [data]);

  const hasAny = (data?.items.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Reminders"
        description="Nudges for water, breaks, bills, meetings and everything in between — delivered to your devices even when My Diary is closed."
        actions={
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" /> New reminder
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: "Reminders", icon: BellRing },
              { value: "archived", label: "Archived", icon: Archive },
              { value: "history", label: "History", icon: History },
            ]}
          />
        </div>
      </PageHeader>

      <PermissionBanner />

      {tab === "history" && <History_ tz={tz} />}

      {tab === "archived" &&
        (archived.isLoading && !archived.data ? (
          <SkeletonList rows={4} />
        ) : archived.error && !archived.data ? (
          <p className="px-1 py-6 text-sm text-danger">Couldn&apos;t load archived reminders.</p>
        ) : !archived.data?.items.length ? (
          <Card>
            <EmptyState icon={Archive} title="Nothing archived" description="Archive reminders you want to keep but not see every day." />
          </Card>
        ) : (
          <Card className="p-1.5">
            <ul className="flex flex-col">
              {archived.data.items.map((r) => (
                <ReminderRow key={r.id} r={r} tz={tz} onEdit={openEdit} archivedView />
              ))}
            </ul>
          </Card>
        ))}

      {tab === "active" && (
        <>
          <div className="mb-5">
            <p className="mb-2 px-1 text-[12px] font-medium text-fg-3">Quick add</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scroll-thin">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => quickCreate(p)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-fg-2 transition-colors hover:border-primary/40 hover:text-fg"
                >
                  <p.icon className="h-3.5 w-3.5 text-primary" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {hasAny && (
            <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scroll-thin" role="group" aria-label="Filter by type">
              {[{ value: "all" as const, label: "All", icon: BellRing, color: "" }, ...KINDS].map((k) => {
                const active = kind === k.value;
                const count = k.value === "all" ? undefined : kindCounts.get(k.value);
                if (k.value !== "all" && !count && !active) return null;
                return (
                  <button
                    key={k.value}
                    onClick={() => setKind(k.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors",
                      active ? "bg-fg text-bg" : "bg-surface-2 text-fg-2 hover:text-fg",
                    )}
                  >
                    <k.icon className="h-3.5 w-3.5" />
                    {k.label}
                    {count ? <span className="tabular-nums">{count}</span> : null}
                  </button>
                );
              })}
            </div>
          )}

          {isLoading && !data ? (
            <SkeletonList rows={6} />
          ) : error && !data ? (
            <Card>
              <EmptyState icon={AlarmClock} title="Couldn't load reminders" description={error instanceof Error ? error.message : "Please try again."} action={<Button variant="outline" onClick={() => refreshReminders()}>Retry</Button>} />
            </Card>
          ) : !hasAny ? (
            <Card>
              <EmptyState
                icon={AlarmClock}
                title="No reminders yet"
                description="Set one for a bill, a meeting or a habit — or use a quick add above to start drinking more water."
                action={
                  <Button onClick={() => openNew()}>
                    <Plus className="h-4 w-4" /> New reminder
                  </Button>
                }
              />
            </Card>
          ) : sections.total === 0 ? (
            <Card>
              <EmptyState icon={kindMeta(kind).icon} title={`No ${kindMeta(kind).label.toLowerCase()} reminders`} description="Try another filter or create one." action={<Button variant="outline" onClick={() => setKind("all")}>Show all</Button>} />
            </Card>
          ) : (
            <>
              {sections.due.length > 0 && (
                <Section title="Due now" count={sections.due.length} icon={BellRing}>
                  <Card className="border-warning/30 p-1.5">
                    <ul className="flex flex-col gap-0.5">
                      {sections.due.map((r) => (
                        <ReminderRow key={r.id} r={r} tz={tz} due onEdit={openEdit} />
                      ))}
                    </ul>
                  </Card>
                </Section>
              )}

              <Section title="Upcoming" count={sections.upcomingCount} icon={AlarmClock}>
                {sections.upcomingCount === 0 ? (
                  <Card>
                    <p className="px-4 py-6 text-center text-[13px] text-fg-3">No one-time reminders coming up.</p>
                  </Card>
                ) : (
                  <Card className="p-1.5">
                    {Object.entries(sections.upcoming).map(([label, list]) =>
                      list.length ? (
                        <SubGroup key={label} label={label}>
                          {list.map((r) => (
                            <ReminderRow key={r.id} r={r} tz={tz} onEdit={openEdit} />
                          ))}
                        </SubGroup>
                      ) : null,
                    )}
                  </Card>
                )}
              </Section>

              <Section title="Recurring" count={sections.recurring.length} icon={Repeat}>
                {sections.recurring.length === 0 ? (
                  <Card>
                    <p className="px-4 py-6 text-center text-[13px] text-fg-3">No repeating reminders. Try “Drink water every 2 hours”.</p>
                  </Card>
                ) : (
                  <Card className="p-1.5">
                    <ul className="flex flex-col">
                      {sections.recurring.map((r) => (
                        <ReminderRow key={r.id} r={r} tz={tz} onEdit={openEdit} />
                      ))}
                    </ul>
                  </Card>
                )}
              </Section>

              {sections.completed.length > 0 && (
                <Section
                  title="Completed"
                  count={sections.completed.length}
                  action={
                    <button onClick={() => setShowCompleted((v) => !v)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-fg-2 hover:bg-surface-2" aria-expanded={showCompleted}>
                      {showCompleted ? "Hide" : "Show"}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showCompleted && "rotate-180")} />
                    </button>
                  }
                >
                  {showCompleted && (
                    <Card className="p-1.5">
                      <ul className="flex flex-col">
                        {sections.completed.slice(0, 50).map((r) => (
                          <ReminderRow key={r.id} r={r} tz={tz} onEdit={openEdit} />
                        ))}
                      </ul>
                    </Card>
                  )}
                </Section>
              )}
            </>
          )}
        </>
      )}

      <ReminderDialog open={dialog.open} onOpenChange={(open) => setDialog((s) => ({ ...s, open }))} tz={tz} reminder={dialog.reminder} initial={dialog.initial} />
    </div>
  );
}
