import { db } from "@/lib/db";
import { query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { extractText } from "../notes/_lib";

const SEARCH_TYPES = ["tasks", "goals", "reminders", "notes", "events", "vault"] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

const LABELS: Record<SearchType, string> = {
  tasks: "Tasks",
  goals: "Goals",
  reminders: "Reminders",
  notes: "Notes",
  events: "Events",
  vault: "Personal info",
};

const PER_GROUP = 6;
const QUICK_ACTIONS = [
  { id: "new-task", label: "New task" },
  { id: "new-note", label: "New note", href: "/notes?new=1" },
  { id: "open-calendar", label: "Open calendar", href: "/calendar" },
  { id: "ask-ai", label: "Ask AI…" },
  { id: "open-settings", label: "Open settings", href: "/settings" },
];

export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const userId = user.id;

  if (!q) {
    const recent = await db.recentSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, query: true } });
    return { q, groups: [], recent, quickActions: QUICK_ACTIONS };
  }

  const requested = (sp.get("types") ?? "").split(",").filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t));
  const types = new Set<SearchType>(requested.length ? requested : SEARCH_TYPES);
  const tz = tzOf(req);
  const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
  const fmtDayTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  const ci = { contains: q, mode: "insensitive" as const };
  const live = { userId, deletedAt: null };

  const [tasks, goals, reminders, notes, events, vault] = await Promise.all([
    types.has("tasks")
      ? db.task.findMany({ where: { ...live, OR: [{ title: ci }, { description: ci }] }, select: { id: true, title: true, dueDate: true, status: true, archivedAt: true }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: PER_GROUP })
      : [],
    types.has("goals")
      ? db.goal.findMany({ where: { ...live, OR: [{ title: ci }, { description: ci }] }, select: { id: true, title: true, category: true, status: true, archivedAt: true }, orderBy: { updatedAt: "desc" }, take: PER_GROUP })
      : [],
    types.has("reminders")
      ? db.reminder.findMany({ where: { ...live, OR: [{ title: ci }, { notes: ci }] }, select: { id: true, title: true, remindAt: true, status: true, archivedAt: true }, orderBy: { remindAt: "asc" }, take: PER_GROUP })
      : [],
    types.has("notes")
      ? db.note.findMany({ where: { ...live, OR: [{ title: ci }, { plainText: ci }] }, select: { id: true, title: true, content: true, archivedAt: true, category: { select: { name: true } } }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: PER_GROUP })
      : [],
    types.has("events")
      ? db.calendarEvent.findMany({ where: { ...live, OR: [{ title: ci }, { description: ci }, { location: ci }] }, select: { id: true, title: true, start: true, allDay: true }, orderBy: { start: "desc" }, take: PER_GROUP })
      : [],
    // Vault: titles and categories only — encrypted fields are never decrypted for search.
    types.has("vault")
      ? db.vaultItem.findMany({ where: { ...live, OR: [{ title: ci }, { category: ci }] }, select: { id: true, title: true, category: true }, orderBy: { title: "asc" }, take: PER_GROUP })
      : [],
  ]);

  const archived = (a: Date | null) => (a ? " · Archived" : "");
  const snippet = (text: string) => {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text.slice(0, 80);
    const start = Math.max(0, i - 30);
    return (start > 0 ? "…" : "") + text.slice(start, start + 90).replace(/\s+/g, " ");
  };
  const STATUS: Record<string, string> = { NOT_STARTED: "To do", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled", ACTIVE: "Active", ON_HOLD: "On hold", ABANDONED: "Abandoned" };

  const groups = [
    { type: "tasks" as const, items: tasks.map((t) => ({ id: t.id, title: t.title, subtitle: (t.dueDate ? `Due ${fmtDay(t.dueDate)}` : "No due date") + ` · ${STATUS[t.status]}` + archived(t.archivedAt), href: `/tasks?id=${t.id}` })) },
    { type: "goals" as const, items: goals.map((g) => ({ id: g.id, title: g.title, subtitle: `${g.category} · ${STATUS[g.status]}` + archived(g.archivedAt), href: `/goals/${g.id}` })) },
    { type: "reminders" as const, items: reminders.map((r) => ({ id: r.id, title: r.title, subtitle: (r.status === "COMPLETED" ? "Completed" : fmtDayTime(r.remindAt)) + archived(r.archivedAt), href: `/reminders` })) },
    { type: "notes" as const, items: notes.map((n) => ({ id: n.id, title: n.title, subtitle: [n.category?.name, snippet(extractText(n.content))].filter(Boolean).join(" · ") + archived(n.archivedAt), href: `/notes?id=${n.id}` })) },
    { type: "events" as const, items: events.map((e) => ({ id: e.id, title: e.title, subtitle: e.allDay ? `${fmtDay(e.start)} · All day` : fmtDayTime(e.start), href: `/calendar?date=${dayKey(e.start, tz)}` })) },
    { type: "vault" as const, items: vault.map((v) => ({ id: v.id, title: v.title, subtitle: v.category, href: `/vault?id=${v.id}` })) },
  ]
    .filter((g) => types.has(g.type) && g.items.length > 0)
    .map((g) => ({ ...g, label: LABELS[g.type] }));

  return { q, groups };
});
