import "server-only";
import type { AIMessage } from "@prisma/client";
import { chat, type ChatMessage, type ToolCall } from "./provider";
import { buildSnapshot, snapshotToText } from "./context";
import { describeContext, executeReadTool, serializeResult, TOOL_SPECS } from "./tools";
import { isWriteTool, TOOL_LABELS, type ToolCallRecord } from "./types";

const MAX_ITERATIONS = 5;

export async function systemPrompt(userId: string, tz: string, now = new Date()) {
  const snapshot = await buildSnapshot(userId, tz, now);
  return `You are Daybook's assistant: a concise, practical productivity assistant inside the user's personal dashboard (tasks, goals, habits, reminders, calendar, notes).

Rules:
- Use tools to look things up instead of guessing. IDs in the snapshot below are real; use them.
- Write actions (create_task, update_task, create_tasks_for_goal, create_reminder, create_event, create_note, complete_task) are NOT executed by you. Calling one shows the user a confirmation card; the card IS the confirmation step, so don't ask "shall I?" first — propose the action directly with sensible values, then say in one line what you proposed.
- Dates/times in tool inputs are local to the user's timezone (${tz}): days as yyyy-MM-dd, times as HH:mm (24h), date-times as yyyy-MM-ddTHH:mm without offset. Resolve relative words ("tomorrow", "Friday") from the current date below.
- "Remind me to drink water every two hours" → create_reminder with recurrence HOURLY, intervalMinutes 120, kind "water" (omit remindAt so it starts one interval from now, or set a sensible first time within waking hours).
- "Plan my day" → check get_schedule for today (free slots inside working hours), weigh overdue and high-priority tasks, deadlines and goals, then reply with a realistic time-blocked schedule (Markdown list "09:30–10:30 · Task — why"). Leave buffers; don't overfill; respect events. Only propose update_task with startTime/endTime if the user asks to apply it.
- "Break my <X> goal into weekly tasks" → find the goal (search or get_goal by title), look at its target date, milestones and existing tasks, then propose create_tasks_for_goal with one concrete task per week and due dates.
- "What should I focus on today?" → weigh priority, deadlines/overdue, goal progress and the calendar; recommend at most 3 things with a one-line reason each.
- "Summarize my week" → use get_week_summary; give wins, numbers vs last week, what slipped and one suggestion.
- If something is ambiguous (which task?), ask one short question.
- Answer in Markdown: short paragraphs, bullet lists, **bold** for key items. No tables, no HTML. Be brief.

Current snapshot:
${snapshotToText(snapshot)}`;
}

/** Converts stored conversation rows to provider-neutral history (text-only for past turns). */
export function historyFromRows(rows: Pick<AIMessage, "role" | "content" | "toolCalls">[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of rows) {
    if (r.role === "USER") out.push({ role: "user", text: r.content });
    else {
      const calls = (Array.isArray(r.toolCalls) ? r.toolCalls : []) as unknown as ToolCallRecord[];
      const notes = calls
        .filter((c) => !c.readOnly)
        .map((c) => {
          const state = c.status === "done" ? `confirmed by user — ${c.summary ?? "done"}` : c.status === "rejected" ? "dismissed by user" : c.status === "error" ? `failed: ${c.error}` : "awaiting user confirmation";
          return `[Proposed ${c.name} ${JSON.stringify(c.input)} → ${state}]`;
        });
      const text = [r.content, ...notes].filter(Boolean).join("\n");
      if (!text) continue;
      if (r.role === "TOOL") out.push({ role: "assistant", text: `(App update) ${text}` });
      else out.push({ role: "assistant", text });
    }
  }
  return out;
}

export interface AssistantTurn {
  text: string;
  toolCalls: ToolCallRecord[];
}

/**
 * Runs the model with tools. Read-only tools execute and feed back (up to
 * MAX_ITERATIONS); write tools stop the loop and are returned as "pending".
 */
export async function runAssistant(opts: { userId: string; tz: string; history: ChatMessage[]; now?: Date }): Promise<AssistantTurn> {
  const { userId, tz } = opts;
  const now = opts.now ?? new Date();
  const system = await systemPrompt(userId, tz, now);
  const messages: ChatMessage[] = [...opts.history];
  const records: ToolCallRecord[] = [];
  const texts: string[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await chat({ system, messages, tools: TOOL_SPECS, maxTokens: 2048 });
    if (res.text.trim()) texts.push(res.text.trim());
    if (!res.toolCalls.length) break;

    const reads = res.toolCalls.filter((c) => !isWriteTool(c.name));
    const writes = res.toolCalls.filter((c) => isWriteTool(c.name));

    const results: { id: string; name: string; content: string; isError?: boolean }[] = [];
    for (const call of reads) {
      try {
        const result = await executeReadTool(call.name, call.input, { userId, tz, now });
        records.push({ id: call.id, name: call.name, input: call.input, status: "done", readOnly: true, summary: TOOL_LABELS[call.name] ?? call.name });
        results.push({ id: call.id, name: call.name, content: serializeResult(result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool failed";
        records.push({ id: call.id, name: call.name, input: call.input, status: "error", readOnly: true, error: message });
        results.push({ id: call.id, name: call.name, content: `Error: ${message}`, isError: true });
      }
    }

    if (writes.length) {
      for (const call of writes) records.push(await pendingRecord(call, userId));
      break; // Writes wait for the user; the turn ends here.
    }

    messages.push({ role: "assistant", text: res.text, toolCalls: res.toolCalls });
    messages.push({ role: "tool", results });
    if (i === MAX_ITERATIONS - 1 && !texts.length) texts.push("I looked through your data but ran out of steps before finishing. Try asking a more specific question.");
  }

  const pending = records.filter((r) => r.status === "pending").length;
  let text = texts.join("\n\n");
  if (!text && pending) text = pending === 1 ? "Here's what I'd do — confirm below." : `Here are ${pending} proposed changes — confirm below.`;
  return { text, toolCalls: records };
}

async function pendingRecord(call: ToolCall, userId: string): Promise<ToolCallRecord> {
  const context = await describeContext(call.name, call.input, userId).catch(() => undefined);
  return { id: call.id, name: call.name, input: call.input, status: "pending", readOnly: false, ...(context ? { context } : {}) };
}
