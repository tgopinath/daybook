// Quick Capture parsing. Pure and dependency-light so it runs on both the
// client (live "Basic parsing" preview) and the server. No server-only imports.
import * as chrono from "chrono-node";
import { dayKey, tzOffsetMinutes } from "../time";

export type CaptureIntent = "task" | "reminder" | "event" | "habit" | "note";
export type CapturePriority = "HIGH" | "MEDIUM" | "LOW";
export type CaptureRecurrenceKind = "NONE" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface CaptureRecurrence {
  kind: CaptureRecurrenceKind;
  intervalMinutes?: number | null;
  daysOfWeek?: number[] | null;
}

export interface CaptureParse {
  intent: CaptureIntent;
  title: string;
  date: string | null; // yyyy-MM-dd in the user's tz
  time: string | null; // HH:mm
  endTime: string | null; // HH:mm
  priority: CapturePriority | null;
  recurrence: CaptureRecurrence;
  category: string | null;
  confidence: "high" | "medium" | "low";
  source: "basic" | "ai";
  /** The phrases that were recognised, for highlighting in the preview. */
  matched: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, "forty-five": 45, a: 1, an: 1,
};
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = "(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday|rsday)?s?";

function dayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return DAY_NAMES.findIndex((d) => d.startsWith(w));
}

function toNumber(word: string): number | null {
  const n = Number(word);
  if (Number.isFinite(n) && n > 0) return n;
  return NUMBER_WORDS[word.toLowerCase()] ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");

interface Strip {
  text: string;
  matched: string[];
}

/** Removes the first match of `re` from s.text and records it. Returns the match. */
function take(s: Strip, re: RegExp): RegExpMatchArray | null {
  const m = s.text.match(re);
  if (!m || m.index === undefined) return null;
  s.matched.push(m[0].trim());
  s.text = `${s.text.slice(0, m.index)} ${s.text.slice(m.index + m[0].length)}`;
  return m;
}

function parseRecurrence(s: Strip): CaptureRecurrence {
  let m: RegExpMatchArray | null;
  // every 2 hours / every 30 minutes / every two hours
  if ((m = take(s, /\b(?:every|each)\s+([\w-]+)\s+(hours?|hrs?|minutes?|mins?)\b/i))) {
    const n = toNumber(m[1]!) ?? 1;
    const minutes = /^h/i.test(m[2]!) ? n * 60 : n;
    return { kind: "HOURLY", intervalMinutes: Math.max(5, Math.round(minutes)) };
  }
  if ((m = take(s, /\b(?:every|each)\s+(hour|half[\s-]hour)\b|\bhourly\b/i))) {
    return { kind: "HOURLY", intervalMinutes: /half/i.test(m[0]) ? 30 : 60 };
  }
  if (take(s, /\b(?:every|each)\s+week\s?days?\b|\bon\s+weekdays\b|\bweekdays\b/i)) {
    return { kind: "WEEKLY", daysOfWeek: [1, 2, 3, 4, 5] };
  }
  if (take(s, /\b(?:every|each)\s+weekends?\b|\bon\s+weekends\b/i)) {
    return { kind: "WEEKLY", daysOfWeek: [0, 6] };
  }
  const daysRe = new RegExp(`\\b(?:every|each|on)\\s+(${DAY_RE}(?:\\s*(?:,|and|&)\\s*${DAY_RE})*)\\b`, "i");
  const dm = s.text.match(daysRe);
  // "on Friday" alone is a date, not a recurrence: require every/each, or a plural ("on Mondays").
  if (dm && (/^(every|each)/i.test(dm[0]) || /days\b/i.test(dm[1]!))) {
    take(s, daysRe);
    const days = dm[1]!
      .split(/\s*(?:,|and|&)\s*/)
      .map((w) => dayIndex(w.trim()))
      .filter((d) => d >= 0);
    return { kind: "WEEKLY", daysOfWeek: [...new Set(days)].sort() };
  }
  if (take(s, /\b(?:every|each)\s+(?:day|morning|evening|night|afternoon)\b|\bdaily\b|\beveryday\b|\bevery\s+single\s+day\b/i)) {
    return { kind: "DAILY" };
  }
  if (take(s, /\b(?:every|each)\s+week\b|\bweekly\b/i)) return { kind: "WEEKLY" };
  if (take(s, /\b(?:every|each)\s+month\b|\bmonthly\b/i)) return { kind: "MONTHLY" };
  if (take(s, /\b(?:every|each)\s+year\b|\byearly\b|\bannually\b/i)) return { kind: "YEARLY" };
  return { kind: "NONE" };
}

function parsePriority(s: Strip): CapturePriority | null {
  if (take(s, /\b(?:urgent(?:ly)?|asap|important|critical|high\s+priority|top\s+priority)\b|(?:^|\s)!(?:high|1|!)(?=\s|$)/i)) return "HIGH";
  if (take(s, /\b(?:low\s+priority|whenever|someday|no\s+rush)\b|(?:^|\s)!(?:low|3)(?=\s|$)/i)) return "LOW";
  if (take(s, /\bmedium\s+priority\b|(?:^|\s)!(?:medium|2)(?=\s|$)/i)) return "MEDIUM";
  return null;
}

const CATEGORY_RULES: [string, RegExp][] = [
  ["Finance", /\b(pay|bill|bills|rent|invoice|tax|taxes|bank|insurance|salary|budget|emi|loan|electricity|subscription)\b/i],
  ["Health", /\b(gym|run|running|workout|exercise|doctor|dentist|medicine|meds|pills|water|meditate|meditation|yoga|walk|stretch|sleep|health)\b/i],
  ["Shopping", /\b(buy|groceries|grocery|shop|shopping|order|pick\s+up|purchase)\b/i],
  ["Learning", /\b(read|reading|study|course|learn|practice|book|pages|lesson|homework|research)\b/i],
  ["Work", /\b(meeting|report|client|email|emails|slides|deck|presentation|portfolio|project|review|standup|deploy|interview|office|manager|team)\b/i],
  ["Personal", /\b(call|mom|dad|mum|family|birthday|friend|wife|husband|kids|home|clean|laundry)\b/i],
];

const EVENT_RE = /\b(meeting|meet\s+with|appointment|interview|lunch\s+with|dinner\s+with|coffee\s+with|party|wedding|flight|conference|webinar|standup|stand-up|sync|1:1|one-on-one|class|concert|game)\b/i;
const HABIT_RE = /\b(read|exercise|workout|meditate|journal|practice|study|stretch|walk|run|drink|floss|sleep|yoga|pray|learn|write)\b/i;
const TIME_OF_DAY: Record<string, string> = { morning: "09:00", noon: "12:00", afternoon: "14:00", evening: "18:00", tonight: "20:00", night: "20:00", midnight: "23:59" };

function cleanTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  // Trailing / leading connector words left behind after removing dates.
  const trailing = /\s*(?:\b(?:by|on|at|due|before|until|till|for|in|this|next|from|to|and|starting|every|the)\b|[,;:-])\s*$/i;
  for (let i = 0; i < 5 && trailing.test(t); i++) t = t.replace(trailing, "").trim();
  t = t.replace(/^[\s,;:!.-]+/, "").replace(/^(?:and|then|to)\s+/i, "").trim();
  t = t.replace(/[.,;:!-]+$/, "").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
}

/**
 * Parses free text like "Call John tomorrow at 10 AM" into a structured
 * capture preview. `now` is the reference instant and `tz` the user's IANA zone.
 */
export function parseCapture(text: string, now: Date, tz: string): CaptureParse {
  const input = text.trim();
  const s: Strip = { text: ` ${input} `, matched: [] };
  let intent: CaptureIntent | null = null;
  let strongIntent = false;

  // Explicit prefixes.
  if (take(s, /^\s*(?:note|idea|thought|jot)\s*[:\-]\s*/i) || take(s, /^\s*(?:note\s+(?:that|to\s+self)|jot\s+down)\s+/i)) {
    intent = "note";
    strongIntent = true;
  } else if (take(s, /^\s*(?:remind\s+me\s+(?:to\s+|about\s+|that\s+)?|reminder\s*[:\-]?\s*(?:to\s+)?|don'?t\s+forget\s+(?:to\s+)?)/i)) {
    intent = "reminder";
    strongIntent = true;
  } else if (take(s, /^\s*(?:habit\s*[:\-]\s*|start\s+a\s+habit\s+(?:of\s+)?)/i)) {
    intent = "habit";
    strongIntent = true;
  } else if (take(s, /^\s*(?:event|meeting)\s*[:\-]\s*/i)) {
    intent = "event";
    strongIntent = true;
  } else {
    take(s, /^\s*(?:todo|task|to-do)\s*[:\-]\s*/i);
  }

  if (intent === "note") {
    const title = cleanTitle(s.text);
    return {
      intent, title, date: null, time: null, endTime: null, priority: null, recurrence: { kind: "NONE" },
      category: null, confidence: title ? "high" : "low", source: "basic", matched: s.matched,
    };
  }

  const recurrence = parseRecurrence(s);
  const priority = parsePriority(s);

  // Dates and times via chrono, interpreted in the user's timezone.
  let date: string | null = null;
  let time: string | null = null;
  let endTime: string | null = null;
  let dateUncertain = false;
  const ref = { instant: now, timezone: tzOffsetMinutes(now, tz) };
  const results = chrono.parse(s.text, ref, { forwardDate: true });
  // Remove matched spans from right to left so indices stay valid.
  for (const r of [...results].sort((a, b) => b.index - a.index)) {
    // Ignore bare numbers ("20 pages") that chrono sometimes reads as times.
    if (/^\d{1,2}$/.test(r.text.trim())) continue;
    const st = r.start;
    const hasDate = st.isCertain("day") || st.isCertain("weekday") || st.isCertain("month") || /\b(today|tomorrow|tonight|yesterday|this|next|week|month)\b/i.test(r.text);
    const certainTime = st.isCertain("hour");
    const tod = r.text.toLowerCase().match(/\b(morning|noon|afternoon|evening|tonight|night|midnight)\b/);
    if (hasDate || !date) {
      const y = st.get("year")!;
      const mo = st.get("month")!;
      const d = st.get("day")!;
      if (!date || hasDate) date = `${y}-${pad(mo)}-${pad(d)}`;
      if (!hasDate) dateUncertain = true;
    }
    if (certainTime) {
      time = `${pad(st.get("hour")!)}:${pad(st.get("minute") ?? 0)}`;
      if (r.end?.isCertain("hour")) endTime = `${pad(r.end.get("hour")!)}:${pad(r.end.get("minute") ?? 0)}`;
    } else if (tod && !time) {
      time = TIME_OF_DAY[tod[1]!] ?? null;
    }
    s.matched.push(r.text.trim());
    s.text = `${s.text.slice(0, r.index)} ${s.text.slice(r.index + r.text.length)}`;
  }
  // A time-only phrase ("at 9") without a date means the next occurrence of that time.
  if (time && dateUncertain && !results.some((r) => r.start.isCertain("day") || r.start.isCertain("weekday"))) {
    const today = dayKey(now, tz);
    if (!date) date = today;
  }

  const title = cleanTitle(s.text);

  // Intent inference.
  if (!intent) {
    if (recurrence.kind === "HOURLY") intent = "reminder";
    else if (EVENT_RE.test(input)) intent = "event";
    else if (recurrence.kind !== "NONE" && HABIT_RE.test(title) && !time) intent = "habit";
    else if (recurrence.kind !== "NONE") intent = "reminder";
    else intent = "task";
  }
  // A recurring date on a habit/reminder is the anchor, not a due date.
  if (intent === "habit") date = null;

  let category: string | null = null;
  for (const [name, re] of CATEGORY_RULES) {
    if (re.test(input)) {
      category = name;
      break;
    }
  }

  let confidence: CaptureParse["confidence"] = "high";
  if (!title) confidence = "low";
  else if (dateUncertain && !time) confidence = "medium";
  else if (!strongIntent && (intent === "event" || intent === "habit")) confidence = "medium";
  else if (intent === "event" && !time) confidence = "medium";
  else if (intent === "reminder" && !time && recurrence.kind !== "HOURLY") confidence = "medium";

  return { intent, title, date, time, endTime, priority, recurrence, category, confidence, source: "basic", matched: s.matched };
}

/** True when Enter may save straight away (with an Undo toast) instead of asking. */
export function isUnambiguous(p: CaptureParse): boolean {
  return p.intent === "task" && p.recurrence.kind === "NONE" && p.confidence === "high" && p.title.length > 0;
}

/** "Every 2 hours", "Daily", "Mon, Wed" — for the preview. */
export function describeCaptureRecurrence(r: CaptureRecurrence): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (r.kind) {
    case "NONE":
      return "Doesn't repeat";
    case "HOURLY": {
      const m = r.intervalMinutes || 60;
      return m % 60 === 0 ? (m === 60 ? "Every hour" : `Every ${m / 60} hours`) : `Every ${m} minutes`;
    }
    case "DAILY":
      return "Every day";
    case "WEEKLY":
      if (r.daysOfWeek?.length === 5 && [1, 2, 3, 4, 5].every((d) => r.daysOfWeek!.includes(d))) return "Weekdays";
      return r.daysOfWeek?.length ? `Every ${r.daysOfWeek.map((d) => names[d]).join(", ")}` : "Every week";
    case "MONTHLY":
      return "Every month";
    case "YEARLY":
      return "Every year";
  }
}
