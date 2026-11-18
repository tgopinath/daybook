import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api";
import { addDaysKey, dayKey, dayRange } from "@/lib/time";
import { buildSnapshot, getDaySchedule, goalProgress, hhmm, OPEN, toDayKey, weekSummary } from "./context";
import { completeTask, createEvent, createNote, createReminder, createTask, updateTask } from "./records";
import type { ToolSpec } from "./provider";
import { isWriteTool, type ToolCallRecord } from "./types";

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Use yyyy-MM-dd");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}.*)?$/, "Use yyyy-MM-ddTHH:mm");
const priority = z.enum(["HIGH", "MEDIUM", "LOW"]);
const id = z.string().min(1).max(64);
const nullish = <T extends z.ZodTypeAny>(s: T) => s.nullish().transform((v) => v ?? undefined);

const schemas = {
  get_overview: z.object({}).passthrough(),
  search: z.object({ query: z.string().trim().min(1).max(200), types: z.array(z.enum(["tasks", "goals", "notes", "events", "reminders"])).optional() }),
  list_tasks: z.object({
    view: nullish(z.enum(["today", "upcoming", "overdue", "completed", "all"])),
    goalId: nullish(id),
    priority: nullish(priority),
    limit: nullish(z.number().int().min(1).max(50)),
  }),
  get_goal: z.object({ id: nullish(id), title: nullish(z.string().max(200)) }),
  get_schedule: z.object({ from: nullish(day), to: nullish(day) }),
  get_week_summary: z.object({}).passthrough(),

  create_task: z.object({
    title: z.string().trim().min(1).max(300),
    description: nullish(z.string().max(5000)),
    dueDate: nullish(dateTime),
    startTime: nullish(time),
    endTime: nullish(time),
    priority: nullish(priority),
    goalId: nullish(id),
    milestoneId: nullish(id),
    categoryName: nullish(z.string().max(60)),
    recurrence: nullish(z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"])),
  }),
  update_task: z.object({
    id,
    title: nullish(z.string().trim().min(1).max(300)),
    description: nullish(z.string().max(5000)),
    dueDate: nullish(dateTime),
    startTime: nullish(time),
    endTime: nullish(time),
    priority: nullish(priority),
    status: nullish(z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])),
  }),
  create_tasks_for_goal: z.object({
    goalId: id,
    tasks: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(300),
          description: nullish(z.string().max(2000)),
          dueDate: nullish(dateTime),
          priority: nullish(priority),
          milestoneId: nullish(id),
        }),
      )
      .min(1)
      .max(30),
  }),
  create_reminder: z.object({
    title: z.string().trim().min(1).max(200),
    kind: nullish(z.enum(["water", "break", "meeting", "bill", "family", "deadline", "routine", "custom"])),
    remindAt: nullish(dateTime),
    recurrence: nullish(z.enum(["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"])),
    intervalMinutes: nullish(z.number().int().min(5).max(24 * 60)),
    daysOfWeek: nullish(z.array(z.number().int().min(0).max(6)).max(7)),
    notes: nullish(z.string().max(2000)),
  }),
  create_event: z.object({
    title: z.string().trim().min(1).max(200),
    start: dateTime,
    end: nullish(dateTime),
    allDay: nullish(z.boolean()),
    kind: nullish(z.enum(["event", "meeting", "personal", "birthday", "important"])),
    location: nullish(z.string().max(200)),
    description: nullish(z.string().max(2000)),
  }),
  create_note: z.object({ title: z.string().trim().min(1).max(200), text: z.string().max(20000) }),
  complete_task: z.object({ id }),
} as const;

export type ToolName = keyof typeof schemas;

/* ------------------------------------------------------------------ */
/* JSON Schemas shown to the model                                     */
/* ------------------------------------------------------------------ */

const S = {
  str: (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra }),
  int: (description: string, extra: Record<string, unknown> = {}) => ({ type: "integer", description, ...extra }),
  priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  obj: (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false }),
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "get_overview",
    description: "Snapshot of the user's day: today's/overdue/upcoming tasks, today's events, active goals with progress, reminders in the next 24h, habits done today, working hours.",
    parameters: S.obj({}),
  },
  {
    name: "search",
    description: "Full-text search across the user's tasks, goals, notes, calendar events and reminders. Use to find IDs before updating, or a goal by name.",
    parameters: S.obj(
      { query: S.str("Words to search for"), types: { type: "array", items: { type: "string", enum: ["tasks", "goals", "notes", "events", "reminders"] }, description: "Optional subset to search" } },
      ["query"],
    ),
  },
  {
    name: "list_tasks",
    description: "List tasks with filters.",
    parameters: S.obj({
      view: { type: "string", enum: ["today", "upcoming", "overdue", "completed", "all"], description: "Default: all open tasks" },
      goalId: S.str("Only tasks linked to this goal"),
      priority: S.priority,
      limit: S.int("Max rows (default 25)", { minimum: 1, maximum: 50 }),
    }),
  },
  {
    name: "get_goal",
    description: "A goal with its milestones, linked tasks and progress. Pass id, or title to match by name.",
    parameters: S.obj({ id: S.str("Goal id"), title: S.str("Goal title (fuzzy match) when the id is unknown") }),
  },
  {
    name: "get_schedule",
    description: "Calendar events and timed tasks for a date range (max 14 days), plus free slots inside working hours and unscheduled tasks due each day.",
    parameters: S.obj({ from: S.str("Start day yyyy-MM-dd (default today)"), to: S.str("End day yyyy-MM-dd inclusive (default = from)") }),
  },
  {
    name: "get_week_summary",
    description: "This week so far: tasks completed vs last week, pending tasks, goal progress changes and habit completion.",
    parameters: S.obj({}),
  },
  {
    name: "create_task",
    description: "Propose creating a task. The user confirms before it is saved. Dates are in the user's timezone.",
    parameters: S.obj(
      {
        title: S.str("Short imperative title"),
        description: S.str("Optional details"),
        dueDate: S.str("Due day yyyy-MM-dd"),
        startTime: S.str("Optional HH:mm (24h) start time on the due day"),
        endTime: S.str("Optional HH:mm (24h) end time"),
        priority: S.priority,
        goalId: S.str("Link to a goal"),
        milestoneId: S.str("Link to a milestone of that goal"),
        categoryName: S.str("Category name, e.g. Work, Personal, Health, Finance"),
        recurrence: { type: "string", enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] },
      },
      ["title"],
    ),
  },
  {
    name: "update_task",
    description: "Propose changes to an existing task (find its id first). The user confirms before it is saved.",
    parameters: S.obj(
      {
        id: S.str("Task id"),
        title: S.str("New title"),
        description: S.str("New description"),
        dueDate: S.str("New due day yyyy-MM-dd"),
        startTime: S.str("HH:mm"),
        endTime: S.str("HH:mm"),
        priority: S.priority,
        status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] },
      },
      ["id"],
    ),
  },
  {
    name: "create_tasks_for_goal",
    description: "Propose a batch of tasks linked to a goal, e.g. weekly tasks with due dates. The user confirms before they are saved.",
    parameters: S.obj(
      {
        goalId: S.str("Goal id (look it up with search or get_goal)"),
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          items: S.obj(
            { title: S.str("Task title"), description: S.str("Optional"), dueDate: S.str("yyyy-MM-dd"), priority: S.priority, milestoneId: S.str("Optional milestone id") },
            ["title"],
          ),
        },
      },
      ["goalId", "tasks"],
    ),
  },
  {
    name: "create_reminder",
    description:
      "Propose a reminder. For repeating every N hours use recurrence HOURLY with intervalMinutes (e.g. 120 for every two hours). remindAt is the first time it fires, as local wall time yyyy-MM-ddTHH:mm; omit it for HOURLY to start one interval from now.",
    parameters: S.obj(
      {
        title: S.str("What to remind about"),
        kind: { type: "string", enum: ["water", "break", "meeting", "bill", "family", "deadline", "routine", "custom"] },
        remindAt: S.str("First fire time, local yyyy-MM-ddTHH:mm"),
        recurrence: { type: "string", enum: ["NONE", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] },
        intervalMinutes: S.int("Minutes between reminders for HOURLY/CUSTOM", { minimum: 5, maximum: 1440 }),
        daysOfWeek: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 }, description: "0=Sunday … 6=Saturday, for WEEKLY" },
        notes: S.str("Optional notes"),
      },
      ["title"],
    ),
  },
  {
    name: "create_event",
    description: "Propose a calendar event. start/end are local wall times yyyy-MM-ddTHH:mm (or yyyy-MM-dd with allDay).",
    parameters: S.obj(
      {
        title: S.str("Event title"),
        start: S.str("Local start yyyy-MM-ddTHH:mm"),
        end: S.str("Local end yyyy-MM-ddTHH:mm (default +1h)"),
        allDay: { type: "boolean" },
        kind: { type: "string", enum: ["event", "meeting", "personal", "birthday", "important"] },
        location: S.str("Optional"),
        description: S.str("Optional"),
      },
      ["title", "start"],
    ),
  },
  {
    name: "create_note",
    description: "Propose saving a note. Text uses plain paragraphs; lines starting with '- ' become bullets.",
    parameters: S.obj({ title: S.str("Note title"), text: S.str("Note body") }, ["title", "text"]),
  },
  {
    name: "complete_task",
    description: "Propose marking a task as completed (find its id first).",
    parameters: S.obj({ id: S.str("Task id") }, ["id"]),
  },
];

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

export interface ToolContext {
  userId: string;
  tz: string;
  now?: Date;
}

export interface ToolOutcome {
  result: unknown;
  summary?: string;
  link?: ToolCallRecord["link"];
}

export function validateToolInput(name: string, input: unknown) {
  const schema = (schemas as Record<string, z.ZodTypeAny>)[name];
  if (!schema) throw new ApiError(400, `Unknown tool: ${name}`);
  return schema.parse(input ?? {}) as Record<string, unknown>;
}

const fmtDue = (d: Date | null, tz: string) => (d ? `${dayKey(d, tz)} ${hhmm(d, tz)}` : null);
const live = { deletedAt: null, archivedAt: null } as const;

async function runRead(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const { userId, tz } = ctx;
  const now = ctx.now ?? new Date();
  switch (name) {
    case "get_overview":
      return buildSnapshot(userId, tz, now);

    case "search": {
      const { query, types } = input as z.infer<typeof schemas.search>;
      const want = (t: string) => !types?.length || types.includes(t as never);
      const q = { contains: query, mode: "insensitive" as const };
      const [tasks, goals, notes, events, reminders] = await Promise.all([
        want("tasks") ? db.task.findMany({ where: { userId, deletedAt: null, OR: [{ title: q }, { description: q }] }, select: { id: true, title: true, status: true, priority: true, dueDate: true, goalId: true }, take: 10, orderBy: { updatedAt: "desc" } }) : [],
        want("goals") ? db.goal.findMany({ where: { userId, deletedAt: null, OR: [{ title: q }, { description: q }, { category: q }] }, select: { id: true, title: true, category: true, status: true }, take: 8 }) : [],
        want("notes") ? db.note.findMany({ where: { userId, deletedAt: null, OR: [{ title: q }, { plainText: q }] }, select: { id: true, title: true, plainText: true, updatedAt: true }, take: 6, orderBy: { updatedAt: "desc" } }) : [],
        want("events") ? db.calendarEvent.findMany({ where: { userId, deletedAt: null, OR: [{ title: q }, { description: q }, { location: q }] }, select: { id: true, title: true, start: true, end: true, allDay: true }, take: 8, orderBy: { start: "desc" } }) : [],
        want("reminders") ? db.reminder.findMany({ where: { userId, deletedAt: null, OR: [{ title: q }, { notes: q }] }, select: { id: true, title: true, remindAt: true, recurrence: true, status: true }, take: 8 }) : [],
      ]);
      return {
        tasks: tasks.map((t) => ({ ...t, dueDate: fmtDue(t.dueDate, tz) })),
        goals,
        notes: notes.map((n) => ({ id: n.id, title: n.title, excerpt: n.plainText.slice(0, 200) })),
        events: events.map((e) => ({ id: e.id, title: e.title, start: fmtDue(e.start, tz), end: fmtDue(e.end, tz), allDay: e.allDay })),
        reminders: reminders.map((r) => ({ ...r, remindAt: fmtDue(r.remindAt, tz) })),
      };
    }

    case "list_tasks": {
      const { view, goalId, priority, limit } = input as z.infer<typeof schemas.list_tasks>;
      const [todayStart, todayEnd] = dayRange(now, tz);
      const where: Prisma.TaskWhereInput = { userId, ...live };
      if (goalId) where.goalId = goalId;
      if (priority) where.priority = priority;
      if (view === "today") Object.assign(where, { dueDate: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } });
      else if (view === "upcoming") Object.assign(where, { dueDate: { gte: todayEnd }, status: { in: OPEN } });
      else if (view === "overdue") Object.assign(where, { dueDate: { lt: todayStart }, status: { in: OPEN } });
      else if (view === "completed") Object.assign(where, { status: "COMPLETED" });
      else if (!goalId) Object.assign(where, { status: { in: OPEN } });
      const rows = await db.task.findMany({
        where,
        select: { id: true, title: true, status: true, priority: true, dueDate: true, startTime: true, endTime: true, completedAt: true, goal: { select: { id: true, title: true } }, category: { select: { name: true } } },
        orderBy: view === "completed" ? { completedAt: "desc" } : [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "asc" }],
        take: limit ?? 25,
      });
      return rows.map((t) => ({ ...t, dueDate: fmtDue(t.dueDate, tz), completedAt: fmtDue(t.completedAt, tz), category: t.category?.name ?? null }));
    }

    case "get_goal": {
      const { id: gid, title } = input as z.infer<typeof schemas.get_goal>;
      if (!gid && !title) throw new ApiError(400, "Pass a goal id or title");
      const include = {
        milestones: { orderBy: { sortOrder: "asc" as const } },
        tasks: { where: { deletedAt: null }, select: { id: true, title: true, status: true, priority: true, dueDate: true, milestoneId: true }, orderBy: { dueDate: "asc" as const } },
      };
      let goal = gid ? await db.goal.findFirst({ where: { id: gid, userId, deletedAt: null }, include }) : null;
      if (!goal && title) {
        goal = await db.goal.findFirst({ where: { userId, deletedAt: null, OR: [{ title: { contains: title, mode: "insensitive" } }, { category: { equals: title, mode: "insensitive" } }] }, include, orderBy: { status: "asc" } });
        if (!goal) {
          // Word-level fallback: "fitness goal" → any goal mentioning "fitness".
          const words = title.split(/\s+/).filter((w) => w.length > 3 && !/goal/i.test(w));
          if (words.length)
            goal = await db.goal.findFirst({ where: { userId, deletedAt: null, OR: words.flatMap((w) => [{ title: { contains: w, mode: "insensitive" as const } }, { category: { contains: w, mode: "insensitive" as const } }]) }, include });
        }
      }
      if (!goal) throw notFound("Goal");
      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        category: goal.category,
        status: goal.status,
        startDate: dayKey(goal.startDate, tz),
        targetDate: goal.targetDate ? dayKey(goal.targetDate, tz) : null,
        value: goal.targetValue ? { current: goal.currentValue, target: goal.targetValue, unit: goal.unit } : null,
        progress: goalProgress(goal),
        milestones: goal.milestones.map((m) => ({ id: m.id, title: m.title, done: m.done, dueDate: m.dueDate ? dayKey(m.dueDate, tz) : null })),
        tasks: goal.tasks.map((t) => ({ ...t, dueDate: fmtDue(t.dueDate, tz) })),
      };
    }

    case "get_schedule": {
      const { from, to } = input as z.infer<typeof schemas.get_schedule>;
      const start = toDayKey(from, tz, now);
      let end = to ? toDayKey(to, tz, now) : start;
      if (end < start) end = start;
      const days: string[] = [];
      for (let d = start; d <= end && days.length < 14; d = addDaysKey(d, 1)) days.push(d);
      const out = [];
      for (const d of days) {
        const s = await getDaySchedule(userId, d, tz, now);
        out.push({
          date: s.date,
          workingHours: `${s.workStart}-${s.workEnd}`,
          ...(s.now ? { now: s.now } : {}),
          events: s.events.map((e) => ({ id: e.id, title: e.title, time: e.allDay ? "all day" : `${e.start}-${e.end}` })),
          timedTasks: s.timedTasks.map((t) => ({ id: t.id, title: t.title, time: `${t.start}-${t.end}`, priority: t.priority })),
          freeSlots: s.freeSlots.map((f) => `${f.start}-${f.end} (${f.minutes}m)`),
          unscheduledTasks: s.unscheduled.slice(0, 15).map((t) => ({ id: t.id, title: t.title, priority: t.priority, overdue: t.overdue })),
        });
      }
      return out;
    }

    case "get_week_summary":
      return weekSummary(userId, tz, now);
  }
  throw new ApiError(400, `Unknown tool: ${name}`);
}

async function runWrite(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const { userId, tz } = ctx;
  switch (name) {
    case "create_task": {
      const t = await createTask(userId, tz, input as z.infer<typeof schemas.create_task>);
      return { result: { id: t.id, title: t.title }, summary: `Created task “${t.title}”`, link: { kind: "task", id: t.id } };
    }
    case "update_task": {
      const { id: tid, ...patch } = input as z.infer<typeof schemas.update_task>;
      const t = await updateTask(userId, tz, tid, patch);
      return { result: { id: t.id, title: t.title, status: t.status }, summary: `Updated task “${t.title}”`, link: { kind: "task", id: t.id } };
    }
    case "complete_task": {
      const t = await completeTask(userId, (input as { id: string }).id);
      return { result: { id: t.id, title: t.title, status: t.status }, summary: `Completed “${t.title}”`, link: { kind: "task", id: t.id } };
    }
    case "create_tasks_for_goal": {
      const { goalId, tasks } = input as z.infer<typeof schemas.create_tasks_for_goal>;
      const goal = await db.goal.findFirst({ where: { id: goalId, userId, deletedAt: null }, select: { id: true, title: true } });
      if (!goal) throw notFound("Goal");
      const created = [];
      for (const t of tasks) created.push(await createTask(userId, tz, { ...t, goalId }));
      return {
        result: { goalId, created: created.map((t) => ({ id: t.id, title: t.title })) },
        summary: `Created ${created.length} task${created.length === 1 ? "" : "s"} for “${goal.title}”`,
        link: { kind: "goal", id: goal.id, href: "/goals" },
      };
    }
    case "create_reminder": {
      const r = await createReminder(userId, tz, input as z.infer<typeof schemas.create_reminder>, ctx.now);
      return { result: { id: r.id, title: r.title, firstAt: fmtDue(r.remindAt, tz) }, summary: `Reminder set: “${r.title}” — first at ${hhmm(r.remindAt, tz)}`, link: { kind: "reminder", id: r.id, href: "/reminders" } };
    }
    case "create_event": {
      const e = await createEvent(userId, tz, input as z.infer<typeof schemas.create_event>);
      return { result: { id: e.id, title: e.title, start: fmtDue(e.start, tz) }, summary: `Added “${e.title}” to your calendar`, link: { kind: "event", id: e.id, href: "/calendar" } };
    }
    case "create_note": {
      const n = await createNote(userId, input as z.infer<typeof schemas.create_note>);
      return { result: { id: n.id, title: n.title }, summary: `Saved note “${n.title}”`, link: { kind: "note", id: n.id, href: "/notes" } };
    }
  }
  throw new ApiError(400, `Unknown tool: ${name}`);
}

/** Runs a read-only tool. Never call for write tools. */
export async function executeReadTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  if (isWriteTool(name)) throw new ApiError(400, `${name} needs confirmation`);
  return runRead(name, validateToolInput(name, rawInput), ctx);
}

/** Runs a confirmed write tool. Only reachable through /api/ai/actions. */
export async function executeWriteTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!isWriteTool(name)) throw new ApiError(400, `${name} is not a write tool`);
  return runWrite(name, validateToolInput(name, rawInput), ctx);
}

/** Display context for confirmation cards (task/goal titles behind ids). */
export async function describeContext(name: string, input: Record<string, unknown>, userId: string): Promise<Record<string, string> | undefined> {
  if ((name === "update_task" || name === "complete_task") && typeof input.id === "string") {
    const t = await db.task.findFirst({ where: { id: input.id, userId }, select: { title: true } });
    return t ? { taskTitle: t.title } : undefined;
  }
  if (name === "create_tasks_for_goal" && typeof input.goalId === "string") {
    const g = await db.goal.findFirst({ where: { id: input.goalId, userId }, select: { title: true } });
    return g ? { goalTitle: g.title } : undefined;
  }
  if (name === "create_task" && typeof input.goalId === "string") {
    const g = await db.goal.findFirst({ where: { id: input.goalId, userId }, select: { title: true } });
    return g ? { goalTitle: g.title } : undefined;
  }
  return undefined;
}

/** Keeps tool results small enough to feed back to the model. */
export function serializeResult(result: unknown, max = 12000): string {
  const s = JSON.stringify(result);
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
}

