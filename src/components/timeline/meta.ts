// Life timeline categories and date formatting (shared by the API, the UI and search).
import { Award, Baby, Briefcase, Compass, GraduationCap, Heart, Plane, type LucideIcon } from "lucide-react";

export const TIMELINE_CATEGORIES = ["Childhood", "Education", "Career", "Family", "Travel", "Achievements", "Personal"] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];
export const DATE_PRECISIONS = ["day", "month", "year"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const TIMELINE_META: Record<TimelineCategory, { icon: LucideIcon; color: string }> = {
  Childhood: { icon: Baby, color: "#F28C28" },
  Education: { icon: GraduationCap, color: "#E9A23B" },
  Career: { icon: Briefcase, color: "#993399" },
  Family: { icon: Heart, color: "#E45D5D" },
  Travel: { icon: Plane, color: "#3B9BE9" },
  Achievements: { icon: Award, color: "#20A779" },
  Personal: { icon: Compass, color: "#8B5CF6" },
};

export const timelineMeta = (c: string) =>
  TIMELINE_META[(TIMELINE_CATEGORIES as readonly string[]).includes(c) ? (c as TimelineCategory) : "Personal"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2009", "March 2014" or "14 March 2014" from a yyyy-MM-dd key and its precision. */
export function formatTimelineDate(key: string, precision: string, short = false) {
  const [y, m, d] = key.split("-").map(Number);
  if (precision === "year") return String(y);
  const month = MONTHS[(m ?? 1) - 1]!;
  const mm = short ? month.slice(0, 3) : month;
  if (precision === "month") return `${mm} ${y}`;
  return `${d} ${mm} ${y}`;
}
