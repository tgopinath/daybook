import { z } from "zod";
import { body, route, tzOf } from "@/lib/api";
import { aiConfig, chat, extractJSON, requireAI } from "@/lib/ai/provider";
import { parseCapture, type CaptureParse } from "@/lib/ai/parse";
import { captureRecurrenceSchema } from "@/lib/ai/capture-schema";
import { nowLabel } from "@/lib/ai/context";
import { dayKey } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ text: z.string().trim().min(1, "Type something to capture").max(1000), useAI: z.boolean().optional() });

const aiSchema = z.object({
  intent: z.enum(["task", "reminder", "event", "habit", "note"]),
  title: z.string().trim().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).nullish(),
  recurrence: captureRecurrenceSchema.nullish(),
  category: z.string().max(60).nullish(),
  confidence: z.union([z.enum(["high", "medium", "low"]), z.number()]).nullish(),
});

/**
 * POST { text, useAI? } → { parse }. useAI defaults to true when a key is configured;
 * otherwise the deterministic "Basic parsing" result is returned.
 */
export const POST = route(async ({ req, user }) => {
  const { text, useAI } = await body(req, schema);
  const tz = tzOf(req);
  const now = new Date();
  const basic = parseCapture(text, now, tz);
  const wantAI = useAI ?? !!aiConfig().apiKey;
  if (!wantAI) return { parse: basic };

  requireAI(user.id);
  const res = await chat({
    system: `You turn a quick note into a structured item for a personal productivity app. Now: ${nowLabel(now, tz)} (${tz}); today is ${dayKey(now, tz)}.
Reply with JSON only, no prose:
{"intent":"task|reminder|event|habit|note","title":"clean title without the date/time words","date":"yyyy-MM-dd or null","time":"HH:mm 24h or null","endTime":"HH:mm or null","priority":"HIGH|MEDIUM|LOW or null","recurrence":{"kind":"NONE|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY","intervalMinutes":number|null,"daysOfWeek":[0-6]|null},"category":"Work|Personal|Health|Finance|Shopping|Learning|null","confidence":"high|medium|low"}
Guidance: meetings/appointments with a time → event; "remind me", or repeating every N hours → reminder (HOURLY with intervalMinutes); repeated self-improvement routines (read, exercise, meditate) → habit; otherwise task. urgent/asap/important → HIGH. Habits have no date.`,
    messages: [{ role: "user", text }],
    maxTokens: 400,
    temperature: 0,
  });
  const parsed = aiSchema.safeParse(extractJSON(res.text));
  if (!parsed.success) return { parse: basic, notice: "The AI reply couldn't be read, showing basic parsing instead." };
  const a = parsed.data;
  const confidence: CaptureParse["confidence"] =
    typeof a.confidence === "number" ? (a.confidence >= 0.8 ? "high" : a.confidence >= 0.5 ? "medium" : "low") : (a.confidence ?? "medium");
  const parse: CaptureParse = {
    intent: a.intent,
    title: a.title,
    date: a.intent === "habit" ? null : (a.date ?? null),
    time: a.time ?? null,
    endTime: a.endTime ?? null,
    priority: a.priority ?? null,
    recurrence: a.recurrence ?? { kind: "NONE" },
    category: a.category && a.category !== "null" ? a.category : null,
    confidence,
    source: "ai",
    matched: basic.matched,
  };
  return { parse };
});
