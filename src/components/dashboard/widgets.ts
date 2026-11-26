// Overview widget registry: ids, labels and the default layout.
// Pure module, shared by /api/dashboard(/layout) and the Overview UI.

export const WIDGETS = [
  { id: "summary", label: "Summary cards", description: "Tasks, goals, habits, reminders, calendar and notes at a glance", size: "full" },
  { id: "spaces", label: "My spaces", description: "Diary, schedule, finance, tasks, storage and security in one tap", size: "full" },
  { id: "capture", label: "Quick actions", description: "Shortcuts to add a task, journal, mood, memory or gratitude", size: "full" },
  { id: "focus", label: "Today's Focus", description: "Your three most important tasks", size: "half" },
  { id: "upcoming", label: "Upcoming", description: "The next seven days", size: "half" },
  { id: "mood", label: "Daily mood check-in", description: "Tap an emoji to log how you feel", size: "half" },
  { id: "journal", label: "Quick journal", description: "Jot down what's on your mind", size: "half" },
  { id: "gratitude", label: "Gratitude", description: "Today's three good things", size: "half" },
  { id: "week", label: "This week", description: "Tasks, habits, mood and journal days this week", size: "half" },
  { id: "memories", label: "Recent memories", description: "Your latest memories with photos", size: "full" },
  { id: "productivity", label: "Productivity charts", description: "Tasks, goals and habits over time", size: "full" },
] as const;

export type WidgetId = (typeof WIDGETS)[number]["id"];
export interface WidgetPref {
  id: WidgetId;
  visible: boolean;
}

export const WIDGET_IDS = WIDGETS.map((w) => w.id) as [WidgetId, ...WidgetId[]];
export const widgetMeta = (id: string) => WIDGETS.find((w) => w.id === id);

export const DEFAULT_LAYOUT: WidgetPref[] = WIDGETS.map((w) => ({ id: w.id, visible: true }));

/**
 * Normalise a stored layout: drop unknown/duplicate ids, keep the user's order,
 * append widgets added since (visible by default).
 */
export function normalizeLayout(stored: unknown): WidgetPref[] {
  const raw = readWidgetStore(stored).overview;
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT.map((w) => ({ ...w }));
  const seen = new Set<string>();
  const out: WidgetPref[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const id = (r as { id?: unknown }).id;
    if (typeof id !== "string" || seen.has(id) || !widgetMeta(id)) continue;
    seen.add(id);
    out.push({ id: id as WidgetId, visible: (r as { visible?: unknown }).visible !== false });
  }
  // Widgets added since the layout was saved go in at their default position
  // (after the default widget that precedes them), visible by default.
  DEFAULT_LAYOUT.forEach((w, i) => {
    if (seen.has(w.id)) return;
    const prev = i > 0 ? DEFAULT_LAYOUT[i - 1]!.id : null;
    const at = prev ? out.findIndex((x) => x.id === prev) + 1 : 0;
    out.splice(at > 0 || !prev ? at : out.length, 0, { ...w });
    seen.add(w.id);
  });
  return out;
}

/**
 * `UserSettings.dashboardWidgets` holds several page layouts: `{ overview: [...], mySpace: [...] }`.
 * Older rows store the Overview layout as a plain array; both shapes are read.
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

/** Replace one page's layout (`undefined` = back to default) and keep the others. Returns null when nothing is left to store. */
export function writeWidgetStore(stored: unknown, key: keyof WidgetStore, value: unknown): WidgetStore | null {
  const next: WidgetStore = { ...readWidgetStore(stored), [key]: value };
  if (next.overview === undefined) delete next.overview;
  if (next.mySpace === undefined) delete next.mySpace;
  return Object.keys(next).length ? next : null;
}
