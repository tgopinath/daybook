import { z } from "zod";
import { ApiError, body, route, tzOf } from "@/lib/api";
import { chat, extractJSON, requireAI } from "@/lib/ai/provider";
import { getDaySchedule, nowLabel, toDayKey } from "@/lib/ai/context";
import { isHHMM, toMin } from "@/lib/ai/slots";
import type { PlanBlock } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const schema = z.object({ date: z.string().max(40).nullish(), notes: z.string().max(1000).nullish() });

/** POST { date? } → { date, summary, blocks } — an AI-proposed time-blocked plan (not saved). */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, schema);
  requireAI(user.id);
  const tz = tzOf(req);
  const now = new Date();
  const date = toDayKey(input.date, tz, now);
  const s = await getDaySchedule(user.id, date, tz, now);
  if (!s.freeSlots.length) throw new ApiError(400, s.isToday ? "No free time left inside your working hours today." : "No free time inside your working hours that day.");

  const prompt = [
    `Date: ${date}${s.isToday ? ` (today, now ${s.now})` : ""}. Working hours ${s.workStart}-${s.workEnd}.`,
    s.focus ? `Daily focus: ${s.focus}` : null,
    `Fixed events (do not move, do not overlap):`,
    ...(s.events.length ? s.events.map((e) => `- ${e.allDay ? "all day" : `${e.start}-${e.end}`} ${e.title}`) : ["- none"]),
    `Already scheduled tasks:`,
    ...(s.timedTasks.length ? s.timedTasks.map((t) => `- ${t.start}-${t.end} ${t.title}`) : ["- none"]),
    `Free slots: ${s.freeSlots.map((f) => `${f.start}-${f.end}`).join(", ")}`,
    `Tasks to place (id · title · priority · overdue):`,
    ...(s.unscheduled.length ? s.unscheduled.slice(0, 25).map((t) => `- ${t.id} · ${t.title} · ${t.priority}${t.overdue ? " · OVERDUE" : ""}${t.goal ? ` · goal: ${t.goal}` : ""}`) : ["- none"]),
    input.notes ? `User notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await chat({
    system: `You are a realistic day planner. Now: ${nowLabel(now, tz)}. Place tasks into the free slots only, highest priority and overdue first, with short buffers; estimate sensible durations (15-120 min); don't overfill — leave ~20% slack. You may add one or two non-task blocks (e.g. "Lunch", "Deep work: <goal>") only if useful. Reply with JSON only:
{"summary":"one or two sentences","blocks":[{"start":"HH:mm","end":"HH:mm","taskId":"id from the list or null","title":"...","reason":"max 15 words"}]}`,
    messages: [{ role: "user", text: prompt }],
    maxTokens: 1500,
    temperature: 0.2,
  });
  const json = extractJSON<{ summary?: unknown; blocks?: unknown[] }>(res.text);
  if (!json || !Array.isArray(json.blocks)) throw new ApiError(502, "The AI reply couldn't be read as a plan — try again");

  // Trust nothing: keep only blocks that fit inside a free slot and reference real tasks.
  const taskIds = new Map(s.unscheduled.map((t) => [t.id, t.title]));
  const used = new Set<string>();
  const blocks: PlanBlock[] = [];
  for (const raw of json.blocks as Record<string, unknown>[]) {
    const start = raw.start;
    const end = raw.end;
    if (!isHHMM(start) || !isHHMM(end) || toMin(end) <= toMin(start)) continue;
    const fits = s.freeSlots.some((f) => toMin(start) >= toMin(f.start) && toMin(end) <= toMin(f.end));
    const overlaps = blocks.some((b) => toMin(start) < toMin(b.end) && toMin(end) > toMin(b.start));
    if (!fits || overlaps) continue;
    let taskId = typeof raw.taskId === "string" && taskIds.has(raw.taskId) ? raw.taskId : null;
    if (taskId && used.has(taskId)) taskId = null;
    if (taskId) used.add(taskId);
    const title = taskId ? taskIds.get(taskId)! : typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 200) : null;
    if (!title) continue;
    blocks.push({ start, end, taskId, title, reason: typeof raw.reason === "string" ? raw.reason.slice(0, 200) : undefined });
  }
  blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
  if (!blocks.length) throw new ApiError(502, "The AI proposed a plan that didn't fit your free time — try again");
  return { date, summary: typeof json.summary === "string" ? json.summary : "", blocks };
});
