import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { query, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";
import { extractText } from "../notes/_lib";
import { formatTimelineDate } from "@/components/timeline/meta";

const SEARCH_TYPES = ["tasks", "goals", "reminders", "notes", "events", "vault", "journal", "memories", "photos", "bucket", "timeline", "gratitude"] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

const LABELS: Record<SearchType, string> = {
  tasks: "Tasks",
  goals: "Goals",
  reminders: "Reminders",
  notes: "Notes",
  events: "Events",
  vault: "Personal info",
  journal: "Journal",
  memories: "Memories",
  photos: "Photos",
  bucket: "Bucket list",
  timeline: "Timeline",
  gratitude: "Gratitude",
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

  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const fmtKey = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  };

  const [tasks, goals, reminders, notes, events, vault, journal, memories, photos, bucket, timeline, gratitude] = await Promise.all([
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
    // Journal: private entries match on their title only and never expose their text.
    types.has("journal")
      ? db.journalEntry.findMany({ where: { ...live, OR: [{ title: ci }, { plainText: ci, isPrivate: false }] }, select: { id: true, title: true, entryDate: true, isPrivate: true, plainText: true, archivedAt: true }, orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }], take: PER_GROUP })
      : [],
    types.has("memories")
      ? db.memory.findMany({ where: { ...live, OR: [{ title: ci }, { caption: ci }, { location: ci }] }, select: { id: true, title: true, caption: true, date: true, location: true, archivedAt: true }, orderBy: { date: "desc" }, take: PER_GROUP })
      : [],
    types.has("photos")
      ? db.photoEntry.findMany({ where: { ...live, OR: [{ caption: ci }, { tags: { has: q.toLowerCase().replace(/^#/, "") } }] }, select: { id: true, caption: true, tags: true, takenOn: true }, orderBy: { takenOn: "desc" }, take: PER_GROUP })
      : [],
    types.has("bucket")
      ? db.bucketItem.findMany({ where: { ...live, OR: [{ title: ci }, { description: ci }] }, select: { id: true, title: true, category: true, completedAt: true, targetDate: true, archivedAt: true }, orderBy: { sortOrder: "asc" }, take: PER_GROUP })
      : [],
    types.has("timeline")
      ? db.timelineEvent.findMany({ where: { ...live, OR: [{ title: ci }, { description: ci }] }, select: { id: true, title: true, category: true, date: true, datePrecision: true }, orderBy: { date: "desc" }, take: PER_GROUP })
      : [],
    types.has("gratitude")
      ? db.$queryRaw<{ id: string; date: string; items: string[]; note: string | null }[]>(
          Prisma.sql`SELECT "id", "date", "items", "note" FROM "GratitudeEntry"
            WHERE "userId" = ${userId} AND (array_to_string("items", ' ') ILIKE ${like} OR COALESCE("note", '') ILIKE ${like})
            ORDER BY "date" DESC LIMIT ${PER_GROUP}`,
        )
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
    {
      type: "journal" as const,
      items: journal.map((j) => ({
        id: j.id,
        title: j.title || "Untitled entry",
        subtitle: (j.isPrivate ? `${fmtKey(j.entryDate)} · Private entry` : [fmtKey(j.entryDate), snippet(j.plainText)].filter(Boolean).join(" · ")) + archived(j.archivedAt),
        href: `/journal?id=${j.id}`,
      })),
    },
    { type: "memories" as const, items: memories.map((m) => ({ id: m.id, title: m.title, subtitle: [fmtKey(dayKey(m.date, tz)), m.location, m.caption ? snippet(m.caption) : null].filter(Boolean).join(" · ") + archived(m.archivedAt), href: `/memories?id=${m.id}` })) },
    { type: "photos" as const, items: photos.map((p) => ({ id: p.id, title: p.caption || "Photo", subtitle: [fmtKey(p.takenOn), p.tags.length ? p.tags.map((t) => `#${t}`).join(" ") : null].filter(Boolean).join(" · "), href: `/photos?id=${p.id}` })) },
    {
      type: "bucket" as const,
      items: bucket.map((b) => ({
        id: b.id,
        title: b.title,
        subtitle: `${b.category} · ${b.completedAt ? "Done" : b.targetDate ? `Target ${fmtKey(b.targetDate.toISOString().slice(0, 10))}` : "Someday"}` + archived(b.archivedAt),
        href: `/bucket-list?id=${b.id}`,
      })),
    },
    { type: "timeline" as const, items: timeline.map((t) => ({ id: t.id, title: t.title, subtitle: `${formatTimelineDate(t.date.toISOString().slice(0, 10), t.datePrecision, true)} · ${t.category}`, href: `/timeline?id=${t.id}` })) },
    {
      type: "gratitude" as const,
      items: gratitude.map((g) => {
        const hit = g.items.find((i) => i.toLowerCase().includes(q.toLowerCase())) ?? g.note ?? g.items[0] ?? "";
        return { id: g.id, title: snippet(hit) || "Gratitude", subtitle: `Grateful on ${fmtKey(g.date)}`, href: `/gratitude?date=${g.date}` };
      }),
    },
  ]
    .filter((g) => types.has(g.type) && g.items.length > 0)
    .map((g) => ({ ...g, label: LABELS[g.type] }));

  return { q, groups };
});
