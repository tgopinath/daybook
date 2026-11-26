// My space widget registry: ids, labels, sizes and the default layout.
// Pure module (no React, no icons) shared by /api/my-space(/layout) and the My space UI.

export type WidgetSize = "small" | "large";

export const MY_SPACE_WIDGETS = [
  { id: "tasks", label: "My Tasks", href: "/tasks", description: "Today's and overdue tasks, tick them off here", resizable: true },
  { id: "calendar", label: "Calendar", href: "/calendar", description: "Today's events and what's next", resizable: true },
  { id: "habits", label: "Habits", href: "/habits", description: "Check in today's habits", resizable: true },
  { id: "mood", label: "Mood", href: "/mood", description: "How you feel today, with a quick check-in", resizable: false },
  { id: "reminders", label: "Reminders", href: "/reminders", description: "The next reminders coming up", resizable: true },
  { id: "goals", label: "Goals", href: "/goals", description: "Progress on your active goals", resizable: true },
  { id: "journal", label: "Journal", href: "/journal", description: "Your latest entry and today's page", resizable: false },
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
