import type { Reminder } from "@prisma/client";
import { Bell, Coffee, Flag, GlassWater, Heart, Receipt, Sunrise, Users, type LucideIcon } from "lucide-react";
import type { Wire } from "@/lib/client";
import { addDaysKey, dayKey, zonedToUtc } from "@/lib/time";

export type Kind = "water" | "break" | "meeting" | "bill" | "family" | "deadline" | "routine" | "custom";

export const KINDS: { value: Kind; label: string; icon: LucideIcon; color: string }[] = [
  { value: "water", label: "Drink water", icon: GlassWater, color: "#0EA5E9" },
  { value: "break", label: "Take a break", icon: Coffee, color: "#F59E0B" },
  { value: "meeting", label: "Meeting", icon: Users, color: "#993399" },
  { value: "bill", label: "Pay a bill", icon: Receipt, color: "#10B981" },
  { value: "family", label: "Family", icon: Heart, color: "#EC4899" },
  { value: "deadline", label: "Deadline", icon: Flag, color: "#EF4444" },
  { value: "routine", label: "Routine", icon: Sunrise, color: "#8B5CF6" },
  { value: "custom", label: "Custom", icon: Bell, color: "#64748B" },
];

export function kindMeta(kind: string) {
  return KINDS.find((k) => k.value === kind) ?? KINDS[KINDS.length - 1]!;
}

export type WireReminder = Wire<Reminder> & {
  task: { id: string; title: string } | null;
  habit: { id: string; name: string } | null;
  event: { id: string; title: string; start: string } | null;
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local yyyy-MM-dd and HH:mm of an instant in tz. */
export function toLocalParts(d: Date, tz: string) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date: dayKey(d, tz), time };
}

export function fmtTime(d: Date, tz: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

/** "Today 3:30 PM", "Tomorrow 9:00 AM", "Fri 2:00 PM", "12 Dec 9:00 AM". */
export function fmtWhen(d: Date, tz: string) {
  const today = dayKey(new Date(), tz);
  const k = dayKey(d, tz);
  const t = fmtTime(d, tz);
  if (k === today) return `Today ${t}`;
  if (k === addDaysKey(today, 1)) return `Tomorrow ${t}`;
  if (k === addDaysKey(today, -1)) return `Yesterday ${t}`;
  const diff = (new Date(k).getTime() - new Date(today).getTime()) / 864e5;
  if (diff > 0 && diff < 7) return `${new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short" }).format(d)} ${t}`;
  const sameYear = k.slice(0, 4) === today.slice(0, 4);
  return `${new Intl.DateTimeFormat(undefined, { timeZone: tz, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d)} ${t}`;
}

/** Next half-hour slot from now, in local parts. */
export function nextSlot(tz: string, minutesAhead = 0) {
  const d = new Date(Date.now() + minutesAhead * 60000);
  const ms = 30 * 60000;
  return toLocalParts(new Date(Math.ceil(d.getTime() / ms) * ms), tz);
}

export function tomorrowAt(tz: string, time = "09:00") {
  return zonedToUtc(addDaysKey(dayKey(new Date(), tz), 1), time, tz);
}

export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly" | "interval" | "weekdays";

export type Draft = {
  title: string;
  kind: Kind;
  date: string;
  time: string;
  repeat: Repeat;
  days: number[];
  every: number;
  unit: "minutes" | "hours";
  endDate: string;
  notes: string;
};

export type Preset = { label: string; icon: LucideIcon; instant: boolean; draft: (tz: string) => Partial<Draft> };

export const PRESETS: Preset[] = [
  {
    label: "Drink water every 2 hours",
    icon: GlassWater,
    instant: true,
    draft: (tz) => ({ title: "Drink water", kind: "water", repeat: "interval", every: 2, unit: "hours", ...toLocalParts(new Date(Date.now() + 120 * 60000), tz) }),
  },
  {
    label: "Stretch break every 90 min",
    icon: Coffee,
    instant: true,
    draft: (tz) => ({ title: "Stand up and stretch", kind: "break", repeat: "interval", every: 90, unit: "minutes", ...toLocalParts(new Date(Date.now() + 90 * 60000), tz) }),
  },
  {
    label: "Pay a bill monthly",
    icon: Receipt,
    instant: false,
    draft: (tz) => ({ title: "Pay ", kind: "bill", repeat: "monthly", date: dayKey(tomorrowAt(tz), tz), time: "10:00" }),
  },
  {
    label: "Weekday standup",
    icon: Users,
    instant: false,
    draft: (tz) => ({ title: "Team standup", kind: "meeting", repeat: "weekly", days: [1, 2, 3, 4, 5], date: dayKey(new Date(), tz), time: "09:55" }),
  },
  {
    label: "Call family on Sunday",
    icon: Heart,
    instant: false,
    draft: (tz) => ({ title: "Call family", kind: "family", repeat: "weekly", days: [0], date: dayKey(new Date(), tz), time: "18:00" }),
  },
  {
    label: "Evening wind-down",
    icon: Sunrise,
    instant: false,
    draft: (tz) => ({ title: "Start winding down", kind: "routine", repeat: "daily", date: dayKey(new Date(), tz), time: "22:00" }),
  },
];

export function emptyDraft(tz: string): Draft {
  return { title: "", kind: "custom", ...nextSlot(tz, 30), repeat: "none", days: [], every: 2, unit: "hours", endDate: "", notes: "" };
}

export function draftFromReminder(r: WireReminder, tz: string): Draft {
  const { date, time } = toLocalParts(new Date(r.remindAt), tz);
  let repeat: Repeat = "none";
  let every = 2;
  let unit: Draft["unit"] = "hours";
  if (r.recurrence === "DAILY") repeat = "daily";
  else if (r.recurrence === "WEEKLY") repeat = "weekly";
  else if (r.recurrence === "MONTHLY") repeat = "monthly";
  else if (r.recurrence === "YEARLY") repeat = "yearly";
  else if (r.recurrence === "HOURLY" || (r.recurrence === "CUSTOM" && r.intervalMinutes && !r.daysOfWeek.length)) {
    repeat = "interval";
    const m = r.intervalMinutes || 60;
    if (m % 60 === 0) {
      every = m / 60;
      unit = "hours";
    } else {
      every = m;
      unit = "minutes";
    }
  } else if (r.recurrence === "CUSTOM") repeat = "weekdays";
  return {
    title: r.title,
    kind: (KINDS.some((k) => k.value === r.kind) ? r.kind : "custom") as Kind,
    date,
    time,
    repeat,
    days: r.daysOfWeek,
    every,
    unit,
    endDate: r.endsAt ? dayKey(new Date(r.endsAt), tz) : "",
    notes: r.notes ?? "",
  };
}

/** Converts a form draft to the API payload. */
export function draftToPayload(d: Draft, tz: string) {
  const remindAt = zonedToUtc(d.date, d.time, tz).toISOString();
  const base = { title: d.title.trim(), kind: d.kind, notes: d.notes.trim() || null, remindAt };
  const endsAt = d.repeat !== "none" && d.endDate ? zonedToUtc(d.endDate, "23:59", tz).toISOString() : null;
  const intervalMinutes = d.unit === "hours" ? d.every * 60 : d.every;
  switch (d.repeat) {
    case "none":
      return { ...base, recurrence: "NONE", intervalMinutes: null, daysOfWeek: [], endsAt: null };
    case "daily":
      return { ...base, recurrence: "DAILY", intervalMinutes: null, daysOfWeek: [], endsAt };
    case "weekly":
      return { ...base, recurrence: "WEEKLY", intervalMinutes: null, daysOfWeek: d.days, endsAt };
    case "monthly":
      return { ...base, recurrence: "MONTHLY", intervalMinutes: null, daysOfWeek: [], endsAt };
    case "yearly":
      return { ...base, recurrence: "YEARLY", intervalMinutes: null, daysOfWeek: [], endsAt };
    case "interval":
      return { ...base, recurrence: "HOURLY", intervalMinutes, daysOfWeek: [], endsAt };
    case "weekdays":
      return { ...base, recurrence: "CUSTOM", intervalMinutes: null, daysOfWeek: d.days, endsAt };
  }
}
