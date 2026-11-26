// My space registry: widget ids, labels, sizes, page sections and the saved layout.
// Pure module (no React, no icons) shared by /api/my-space(/layout) and the My space UI.

export type WidgetSize = "small" | "large";

export const MY_SPACE_WIDGETS = [
  { id: "tasks", label: "My Tasks", href: "/tasks", description: "Today's and overdue tasks, tick them off here", resizable: true },
  { id: "calendar", label: "Calendar", href: "/calendar", description: "Today's events and what's next", resizable: true },
  { id: "habits", label: "Habits", href: "/habits", description: "Check in today's habits", resizable: true },
  { id: "reminders", label: "Reminders", href: "/reminders", description: "The next reminders coming up", resizable: true },
  { id: "goals", label: "Goals", href: "/goals", description: "Progress on your active goals", resizable: true },
  { id: "journal", label: "Journal", href: "/journal", description: "Write a few lines for today, see your latest entry", resizable: false },
  { id: "gratitude", label: "Gratitude", href: "/gratitude", description: "Today's three good things", resizable: false },
  { id: "notes", label: "Notes", href: "/notes", description: "Your latest notes", resizable: true },
  { id: "memories", label: "Memories", href: "/memories", description: "Latest memories and On This Day", resizable: true },
  { id: "finance", label: "My Finance", href: "/finance", description: "This month's income, spending and budget", resizable: true },
  { id: "bucket", label: "Bucket List", href: "/bucket-list", description: "How far you've come and what's next", resizable: false },
  { id: "timeline", label: "Life Timeline", href: "/timeline", description: "The latest chapter of your story", resizable: false },
  { id: "vault", label: "Personal Information", href: "/vault", description: "What you keep, counted by category", resizable: false },
  { id: "storage", label: "My Storage", href: "/drive", description: "Space used and recent files", resizable: false },
  { id: "security", label: "My Security", href: "/security", description: "2-step sign-in and app lock status", resizable: false },
] as const;

export type MySpaceWidgetId = (typeof MY_SPACE_WIDGETS)[number]["id"];
export const MY_SPACE_IDS = MY_SPACE_WIDGETS.map((w) => w.id) as [MySpaceWidgetId, ...MySpaceWidgetId[]];
export const mySpaceMeta = (id: string) => MY_SPACE_WIDGETS.find((w) => w.id === id);

export interface MySpacePref {
  id: MySpaceWidgetId;
  visible: boolean;
  size: WidgetSize;
}

/** Large by default: the widgets people act on most. */
const DEFAULT_LARGE = new Set<MySpaceWidgetId>(["tasks"]);

export const DEFAULT_MY_SPACE: MySpacePref[] = MY_SPACE_WIDGETS.map((w) => ({ id: w.id, visible: true, size: DEFAULT_LARGE.has(w.id) ? "large" : "small" }));

/**
 * Normalise a stored layout: drop unknown/duplicate ids, keep the user's order,
 * force "small" for widgets that can't grow, and add widgets introduced since
 * (visible, at their default position).
 */
export function normalizeMySpace(raw: unknown): MySpacePref[] {
  if (!Array.isArray(raw)) return DEFAULT_MY_SPACE.map((w) => ({ ...w }));
  const seen = new Set<string>();
  const out: MySpacePref[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, visible, size } = r as { id?: unknown; visible?: unknown; size?: unknown };
    const meta = typeof id === "string" ? mySpaceMeta(id) : undefined;
    if (!meta || seen.has(meta.id)) continue;
    seen.add(meta.id);
    out.push({ id: meta.id, visible: visible !== false, size: meta.resizable && size === "large" ? "large" : "small" });
  }
  DEFAULT_MY_SPACE.forEach((w, i) => {
    if (seen.has(w.id)) return;
    const prev = i > 0 ? DEFAULT_MY_SPACE[i - 1]!.id : null;
    const at = prev ? out.findIndex((x) => x.id === prev) + 1 : 0;
    out.splice(at > 0 || !prev ? at : out.length, 0, { ...w });
    seen.add(w.id);
  });
  return out;
}

// ------------------------------------------------------------------ page layout

/** Page sections besides "Your spaces" that can be hidden from Customise. */
export const PAGE_SECTIONS = [
  { id: "today", label: "Today", description: "Today's Focus, mood check-in and the next seven days" },
  { id: "week", label: "This week", description: "Weekly summary and productivity charts" },
] as const;
export type PageSectionId = (typeof PAGE_SECTIONS)[number]["id"];
export type SectionPrefs = Record<PageSectionId, boolean>;

export interface MySpaceLayout {
  sections: SectionPrefs;
  widgets: MySpacePref[];
}

export const DEFAULT_SECTIONS: SectionPrefs = { today: true, week: true };
export const defaultLayout = (): MySpaceLayout => ({ sections: { ...DEFAULT_SECTIONS }, widgets: DEFAULT_MY_SPACE.map((w) => ({ ...w })) });

/**
 * `UserSettings.dashboardWidgets` history:
 * - a plain array = the old Overview layout;
 * - `{ overview: [...], mySpace: [...] }` = Overview + My space widget arrays (before the merge);
 * - `{ mySpace: { v: 2, sections, widgets } }` = the merged My space layout (current).
 * All shapes are read; saving writes the current one and drops the old `overview` key.
 */
export type WidgetStore = { overview?: unknown; mySpace?: unknown };

export function readWidgetStore(stored: unknown): WidgetStore {
  if (Array.isArray(stored)) return { overview: stored };
  if (stored && typeof stored === "object") {
    const o = stored as Record<string, unknown>;
    return { overview: o.overview, mySpace: o.mySpace };
  }
  return {};
}

/** Old Overview layout → which page sections stay visible (Today's Focus/Upcoming → Today; This week/charts → This week). */
function sectionsFromOverview(raw: unknown): SectionPrefs {
  const out = { ...DEFAULT_SECTIONS };
  if (!Array.isArray(raw)) return out;
  const vis = new Map<string, boolean>();
  for (const r of raw) {
    if (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string") vis.set((r as { id: string }).id, (r as { visible?: unknown }).visible !== false);
  }
  const anyShown = (ids: string[]) => !ids.some((id) => vis.has(id)) || ids.some((id) => vis.get(id) !== false);
  out.today = anyShown(["focus", "upcoming", "mood"]);
  out.week = anyShown(["week", "productivity"]);
  return out;
}

function normalizeSections(raw: unknown): SectionPrefs {
  const out = { ...DEFAULT_SECTIONS };
  if (raw && typeof raw === "object") {
    for (const s of PAGE_SECTIONS) {
      const v = (raw as Record<string, unknown>)[s.id];
      if (typeof v === "boolean") out[s.id] = v;
    }
  }
  return out;
}

/** The saved My space layout from any stored shape (see `WidgetStore`). */
export function readMySpaceLayout(stored: unknown): MySpaceLayout {
  const { overview, mySpace } = readWidgetStore(stored);
  if (mySpace && typeof mySpace === "object" && !Array.isArray(mySpace)) {
    const m = mySpace as { sections?: unknown; widgets?: unknown };
    return { sections: normalizeSections(m.sections), widgets: normalizeMySpace(m.widgets) };
  }
  return { sections: sectionsFromOverview(overview), widgets: normalizeMySpace(Array.isArray(mySpace) ? mySpace : null) };
}

/** The value to store for a saved layout (`null` = reset to default: nothing stored). */
export function writeMySpaceLayout(layout: MySpaceLayout | null): { mySpace: { v: 2; sections: SectionPrefs; widgets: MySpacePref[] } } | null {
  return layout ? { mySpace: { v: 2, sections: layout.sections, widgets: layout.widgets } } : null;
}
