import "server-only";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { encryptJSON } from "./crypto";
import { addDaysKey, dayKey, weekdayOfKey, zonedToUtc } from "./time";
import { GRATITUDE_PROMPTS } from "./gratitude";

/**
 * Realistic sample data so a new account has something to explore.
 * Every row is flagged isDemo and can be removed in Settings → Data.
 */
export async function seedDemoData(userId: string, tz: string) {
  const today = dayKey(new Date(), tz);
  const at = (offsetDays: number, time: string) => zonedToUtc(addDaysKey(today, offsetDays), time, tz);
  const isDemo = true;

  const [work, personal, health] = await Promise.all(
    [
      { name: "Work", color: "#993399" },
      { name: "Personal", color: "#20A779" },
      { name: "Health", color: "#E9A23B" },
    ].map((c) => db.category.create({ data: { ...c, userId, kind: "general" } })),
  );
  const portfolio = await db.project.create({ data: { userId, name: "Portfolio refresh", color: "#993399" } });

  const fitness = await db.goal.create({
    data: {
      userId,
      isDemo,
      title: "Run a 10K",
      description: "Build up from 3K to a comfortable 10K run.",
      category: "Fitness",
      startDate: at(-21, "07:00"),
      targetDate: at(49, "07:00"),
      targetValue: 10,
      currentValue: 5,
      unit: "km",
      color: "#20A779",
      milestones: {
        create: [
          { title: "Run 3K without stopping", done: true, completedAt: at(-14, "07:30"), sortOrder: 0 },
          { title: "Run 5K under 35 minutes", done: true, completedAt: at(-3, "07:30"), sortOrder: 1 },
          { title: "Run 7.5K", dueDate: at(21, "07:00"), sortOrder: 2 },
          { title: "Race day: 10K", dueDate: at(49, "07:00"), sortOrder: 3 },
        ],
      },
      progressLogs: { create: [{ value: 3, createdAt: at(-14, "08:00") }, { value: 4, createdAt: at(-8, "08:00") }, { value: 5, createdAt: at(-3, "08:00") }] },
    },
  });
  const career = await db.goal.create({
    data: {
      userId,
      isDemo,
      title: "Ship the new portfolio",
      description: "Publish three refreshed case studies.",
      category: "Career",
      startDate: at(-10, "09:00"),
      targetDate: at(23, "18:00"),
      targetValue: 3,
      currentValue: 1,
      unit: "case studies",
      color: "#993399",
      milestones: {
        create: [
          { title: "Case study 1 published", done: true, completedAt: at(-2, "17:00"), sortOrder: 0 },
          { title: "Case study 2 draft", dueDate: at(6, "18:00"), sortOrder: 1 },
          { title: "Case study 3 draft", dueDate: at(16, "18:00"), sortOrder: 2 },
        ],
      },
    },
  });
  const learning = await db.goal.create({
    data: {
      userId,
      isDemo,
      title: "Read 12 books this year",
      category: "Learning",
      startDate: at(-300, "09:00"),
      targetDate: at(44, "23:00"),
      targetValue: 12,
      currentValue: 9,
      unit: "books",
      color: "#E9A23B",
    },
  });

  const standup = await db.calendarEvent.create({
    data: { userId, isDemo, title: "Design review", kind: "meeting", start: at(0, "11:00"), end: at(0, "12:00"), categoryId: work.id, location: "Zoom", color: "#993399" },
  });
  await db.calendarEvent.createMany({
    data: [
      { userId, isDemo, title: "1:1 with manager", kind: "meeting", start: at(0, "15:30"), end: at(0, "16:00"), categoryId: work.id, color: "#993399" },
      { userId, isDemo, title: "Gym session", kind: "personal", start: at(1, "07:00"), end: at(1, "08:00"), categoryId: health.id, color: "#E9A23B" },
      { userId, isDemo, title: "Dinner with family", kind: "personal", start: at(2, "19:30"), end: at(2, "21:00"), categoryId: personal.id, color: "#20A779" },
      { userId, isDemo, title: "Product roadmap workshop", kind: "meeting", start: at(3, "10:00"), end: at(3, "12:30"), categoryId: work.id, color: "#993399" },
      { userId, isDemo, title: "Mom's birthday", kind: "birthday", allDay: true, start: at(5, "00:00"), end: at(6, "00:00"), recurrence: "YEARLY", color: "#E45D5D" },
      { userId, isDemo, title: "Car insurance renewal", kind: "important", allDay: true, start: at(12, "00:00"), end: at(13, "00:00"), color: "#E9A23B" },
      { userId, isDemo, title: "Team offsite", kind: "event", start: at(-2, "09:30"), end: at(-2, "17:00"), categoryId: work.id, color: "#993399" },
    ],
  });

  const tasks: Omit<Prisma.TaskUncheckedCreateInput, "userId">[] = [
    { title: "Prepare slides for design review", priority: "HIGH", status: "IN_PROGRESS", dueDate: at(0, "10:30"), startTime: "09:30", endTime: "10:30", categoryId: work.id, eventId: standup.id, focusRank: 1, description: "Cover the onboarding flow changes and the new empty states." },
    { title: "Write case study 2 outline", priority: "HIGH", dueDate: at(0, "18:00"), categoryId: work.id, projectId: portfolio.id, goalId: career.id, focusRank: 2 },
    { title: "Book dentist appointment", priority: "MEDIUM", dueDate: at(0, "17:00"), categoryId: personal.id, focusRank: 3 },
    { title: "30 minute easy run", priority: "MEDIUM", dueDate: at(0, "07:30"), categoryId: health.id, goalId: fitness.id, status: "COMPLETED", completedAt: at(0, "07:45") },
    { title: "Reply to recruiter email", priority: "LOW", dueDate: at(0, "12:00"), categoryId: work.id, status: "COMPLETED", completedAt: at(0, "09:10") },
    { title: "Pay electricity bill", priority: "HIGH", dueDate: at(-1, "18:00"), categoryId: personal.id },
    { title: "Review quarterly budget", priority: "MEDIUM", dueDate: at(-2, "17:00"), categoryId: personal.id },
    { title: "Export hero images for case study", priority: "MEDIUM", dueDate: at(1, "15:00"), categoryId: work.id, projectId: portfolio.id, goalId: career.id },
    { title: "Interval run: 6 × 400m", priority: "MEDIUM", dueDate: at(2, "07:00"), categoryId: health.id, goalId: fitness.id },
    { title: "Plan weekend trip", priority: "LOW", dueDate: at(4, "20:00"), categoryId: personal.id },
    { title: "Finish 'Atomic Habits'", priority: "LOW", dueDate: at(6, "21:00"), categoryId: personal.id, goalId: learning.id },
    { title: "Update resume", priority: "MEDIUM", categoryId: work.id, projectId: portfolio.id, status: "NOT_STARTED" },
  ];
  // Completed tasks over the past two weeks so charts have history.
  for (let d = 1; d <= 13; d++) {
    const n = (d * 7) % 4;
    for (let i = 0; i < n; i++) {
      tasks.push({ title: ["Inbox zero", "Sketch onboarding ideas", "Grocery run", "Stretching", "Sync with dev team"][(d + i) % 5]!, priority: "LOW", status: "COMPLETED", dueDate: at(-d, "17:00"), completedAt: at(-d, `1${i + 1}:00`), categoryId: [work.id, personal.id, health.id][i % 3] });
    }
  }
  for (const [i, t] of tasks.entries()) {
    await db.task.create({ data: { ...t, userId, isDemo, sortOrder: i } });
  }
  const slides = await db.task.findFirst({ where: { userId, title: "Prepare slides for design review" } });
  if (slides) {
    await db.subtask.createMany({
      data: [
        { taskId: slides.id, title: "Collect screenshots", done: true, sortOrder: 0 },
        { taskId: slides.id, title: "Write speaker notes", sortOrder: 1 },
        { taskId: slides.id, title: "Dry run", sortOrder: 2 },
      ],
    });
  }

  const habitDefs = [
    { name: "Exercise", icon: "dumbbell", color: "#20A779", rate: 0.75 },
    { name: "Read 20 pages", icon: "book-open", color: "#E9A23B", rate: 0.85 },
    { name: "Meditate", icon: "brain", color: "#993399", rate: 0.6 },
    { name: "Drink 8 glasses of water", icon: "glass-water", color: "#3B9BE9", rate: 0.9, targetPerDay: 8 },
    { name: "Sleep by 11 PM", icon: "moon", color: "#8B5CF6", rate: 0.5, reminderTime: "22:30" },
  ];
  for (const [hi, h] of habitDefs.entries()) {
    const habit = await db.habit.create({
      data: { userId, isDemo, name: h.name, icon: h.icon, color: h.color, targetPerDay: h.targetPerDay ?? 1, reminderTime: h.reminderTime, createdAt: at(-60, "08:00") },
    });
    const entries = [];
    for (let d = 1; d <= 60; d++) {
      // Deterministic pseudo-random pattern so streaks look natural.
      const v = Math.abs(Math.sin((d + 1) * (hi + 3) * 12.9898)) % 1;
      if (v < h.rate) entries.push({ habitId: habit.id, date: addDaysKey(today, -d), count: h.targetPerDay ?? 1 });
    }
    if (hi < 2) entries.push({ habitId: habit.id, date: today, count: h.targetPerDay ?? 1 });
    await db.habitEntry.createMany({ data: entries });
    if (h.reminderTime) {
      // Same shape the habits module keeps in sync: one daily routine reminder.
      let remindAt = zonedToUtc(today, h.reminderTime, tz);
      if (remindAt <= new Date()) remindAt = zonedToUtc(addDaysKey(today, 1), h.reminderTime, tz);
      await db.reminder.create({ data: { userId, isDemo, title: h.name, kind: "routine", remindAt, recurrence: "DAILY", habitId: habit.id } });
    }
  }

  await db.reminder.createMany({
    data: [
      { userId, isDemo, title: "Drink water", kind: "water", remindAt: nextSlot(2), recurrence: "HOURLY", intervalMinutes: 120 },
      { userId, isDemo, title: "Stand up and stretch", kind: "break", remindAt: nextSlot(1), recurrence: "HOURLY", intervalMinutes: 90 },
      { userId, isDemo, title: "Pay credit card bill", kind: "bill", remindAt: at(3, "10:00"), recurrence: "MONTHLY" },
      { userId, isDemo, title: "Call grandparents", kind: "family", remindAt: at(1, "18:30"), recurrence: "WEEKLY", daysOfWeek: [] },
      { userId, isDemo, title: "Submit expense report", kind: "deadline", remindAt: at(2, "16:00") },
      { userId, isDemo, title: "Weekly planning", kind: "routine", remindAt: at(4, "09:00"), recurrence: "WEEKLY" },
    ],
  });

  const doc = (paras: (string | { h: string } | { todo: [string, boolean][] })[]) => ({
    type: "doc",
    content: paras.map((p) =>
      typeof p === "string"
        ? { type: "paragraph", content: [{ type: "text", text: p }] }
        : "h" in p
          ? { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: p.h }] }
          : { type: "taskList", content: p.todo.map(([t, c]) => ({ type: "taskItem", attrs: { checked: c }, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] })) },
    ),
  });
  const notes = [
    { title: "Portfolio case study ideas", pinned: true, categoryId: work.id, content: doc([{ h: "Candidates" }, "Calendar redesign — strongest metrics story.", "Workplace dashboard — good for systems thinking.", { todo: [["Pick final three", false], ["Gather before/after screens", true]] }]) },
    { title: "Weekly groceries", favorite: true, categoryId: personal.id, content: doc([{ todo: [["Oats", false], ["Bananas", true], ["Greek yogurt", false], ["Spinach", false]] }]) },
    { title: "Book notes: Deep Work", categoryId: personal.id, content: doc([{ h: "Key ideas" }, "Schedule every minute of the day; protect long blocks for focused work.", "Embrace boredom — don't reach for the phone at every pause."]) },
    { title: "10K training plan", categoryId: health.id, content: doc(["Three runs a week: one easy, one interval, one long.", "Increase long run distance by no more than 10% a week."]) },
  ];
  for (const n of notes) {
    const plainText = docText(n.content);
    await db.note.create({ data: { ...n, userId, isDemo, plainText } });
  }

  await db.vaultItem.createMany({
    data: [
      { userId, isDemo, category: "Emergency contact", title: "Priya (sister)", fieldsEnc: encryptJSON([{ label: "Phone", value: "+91 98765 43210", sensitive: false }, { label: "Relationship", value: "Sister", sensitive: false }]) },
      { userId, isDemo, category: "Vehicle", title: "Hyundai i20", fieldsEnc: encryptJSON([{ label: "Registration", value: "TN 01 AB 1234", sensitive: false }, { label: "Next service", value: "March 2027", sensitive: false }]) },
      { userId, isDemo, category: "Subscription", title: "Spotify Family", fieldsEnc: encryptJSON([{ label: "Renews", value: "12th every month", sensitive: false }, { label: "Cost", value: "₹179 / month", sensitive: false }]) },
      { userId, isDemo, category: "Insurance", title: "Health insurance", fieldsEnc: encryptJSON([{ label: "Provider", value: "Star Health", sensitive: false }, { label: "Policy number", value: "SH-2291-7781", sensitive: true }, { label: "Renewal", value: "1 Feb 2027", sensitive: false }]) },
    ],
  });

  await seedPhase1Demo(userId, tz, today);
}

// ------------------------------------------------------------------ Phase 1 sample data

const DEMO_JOURNAL_TAGS = ["work", "running", "family", "reflection"];
/** Weekly reviews have no isDemo flag: the sample one is recognised by this exact text. */
const DEMO_REVIEW_WINS = "Ran 5K under 35 minutes and published the first case study.";
const demoId = () => `c${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const noonUtc = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12));
};

/** Journal, gratitude, mood, bucket list, timeline, memories and a weekly review for Alex Rivera. createMany only — this runs on every "Explore the demo". */
async function seedPhase1Demo(userId: string, tz: string, today: string) {
  const isDemo = true;
  const at = (offsetDays: number, time: string) => zonedToUtc(addDaysKey(today, offsetDays), time, tz);
  const day = (offset: number) => addDaysKey(today, offset);
  const thisYear = Number(today.slice(0, 4));
  const paras = (texts: string[]) => ({ type: "doc", content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });
  const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

  // Journal tags (unique per user; reuse when they already exist).
  await db.tag.createMany({ data: DEMO_JOURNAL_TAGS.map((name) => ({ userId, name })), skipDuplicates: true });
  const tags = new Map((await db.tag.findMany({ where: { userId, name: { in: DEMO_JOURNAL_TAGS } }, select: { id: true, name: true } })).map((t) => [t.name, t.id]));

  const journal: { offset: number; title: string; mood: string; tags: string[]; text: string[]; isPrivate?: boolean; pinned?: boolean }[] = [
    { offset: -1, title: "A slow, good Sunday", mood: "calm", tags: ["family"], pinned: true, text: ["Long breakfast with Priya and the kids next door. Biscuit stole half a dosa and nobody minded.", "Spent the afternoon reading on the balcony. I want more days that feel this unhurried."] },
    { offset: -3, title: "5K under 35 minutes!", mood: "excited", tags: ["running"], text: ["Finally did it — 34:12. The last kilometre hurt, but I didn't stop once.", "Three weeks ago I couldn't run 3K without walking. Small steps really do add up."] },
    { offset: -5, title: "Case study one is live", mood: "happy", tags: ["work"], text: ["Published the calendar redesign case study today. Got lovely messages from two old teammates.", "Next: outline case study two before the weekend."] },
    { offset: -8, title: "Feeling stretched thin", mood: "stressed", tags: ["work", "reflection"], text: ["Too many meetings, not enough deep work. I said yes to three things I should have declined.", "Tomorrow: block the morning, phone in the other room."] },
    { offset: -11, title: "Things I'm not saying out loud", mood: "anxious", tags: ["reflection"], isPrivate: true, text: ["Wondering whether I'm ready for a lead role, or just want the title. Writing it down helps.", "Talk to Meera about it next week."] },
    { offset: -14, title: "Rainy evening walk", mood: "neutral", tags: [], text: ["Walked around the lake in the drizzle. Nothing special happened, and that was fine."] },
    { offset: -17, title: "Mom's recipe", mood: "happy", tags: ["family"], text: ["Called Mom for her rajma recipe and ended up talking for an hour about her first job in Pune.", "I should write down more of her stories."] },
    { offset: -20, title: "Missed the team offsite", mood: "sad", tags: ["work"], text: ["Fever kept me home from the offsite. The photos look like so much fun.", "Note to self: rest is not falling behind."] },
  ];
  const journalRows: Prisma.JournalEntryCreateManyInput[] = [];
  const journalTags: Prisma.JournalTagCreateManyInput[] = [];
  for (const j of journal) {
    const id = demoId();
    const plainText = j.text.join("\n");
    journalRows.push({
      id,
      userId,
      isDemo,
      title: j.title,
      content: paras(j.text),
      plainText,
      entryDate: day(j.offset),
      mood: j.mood,
      isPrivate: !!j.isPrivate,
      isDraft: false,
      pinned: !!j.pinned,
      wordCount: words(plainText),
      createdAt: at(j.offset, "21:15"),
    });
    for (const t of j.tags) if (tags.get(t)) journalTags.push({ entryId: id, tagId: tags.get(t)! });
  }

  const gratitudePool = [
    ["Morning chai on the balcony", "A quick call with Mom", "Biscuit's happy tail wag"],
    ["Finishing a tough run", "A colleague who covered for me", "Fresh mangoes"],
    ["A quiet hour to read", "Priya's terrible jokes", "Warm socks"],
    ["Good feedback on my work", "Rain after a hot day", "Dinner with friends"],
    ["Sleeping in", "A long walk by the lake", "Finally fixing the leaky tap"],
  ];
  const gratitude: Prisma.GratitudeEntryCreateManyInput[] = [];
  for (let d = 0; d < 14; d++) {
    if ([2, 5, 9, 12].includes(d)) continue;
    gratitude.push({ userId, isDemo, date: day(-d), items: gratitudePool[d % gratitudePool.length]!, prompt: GRATITUDE_PROMPTS[d % GRATITUDE_PROMPTS.length] ?? null, createdAt: at(-d, "21:30") });
  }

  const moodCycle = ["calm", "happy", "neutral", "stressed", "happy", "excited", "anxious", "calm", "sad", "happy"] as const;
  const factorCycle = [["sleep"], ["work"], ["family"], ["work", "sleep"], ["exercise"], ["friends"], ["work"], ["health"], ["weather"], ["exercise", "family"]];
  const moods: Prisma.MoodEntryCreateManyInput[] = [];
  for (let i = 0; i < 20; i++) {
    const offset = -Math.round((i * 29) / 19);
    const mood = moodCycle[i % moodCycle.length]!;
    moods.push({
      userId,
      isDemo,
      date: day(offset),
      mood,
      intensity: [3, 4, 2, 4, 3][i % 5]!,
      factors: factorCycle[i % factorCycle.length]!,
      note: i % 4 === 0 ? ["Slept well for once.", "Busy but productive day.", "Felt off, not sure why.", "Great run this morning."][(i / 4) % 4] : null,
      loggedAt: at(offset, i % 2 ? "20:30" : "09:15"),
    });
  }

  const bucket: Prisma.BucketItemCreateManyInput[] = [
    { title: "See the northern lights", description: "Tromsø in February, with a warm cabin and a good camera.", category: "Travel", targetDate: noonUtc(`${thisYear + 2}-02-15`) },
    { title: "Run a half marathon", description: "After the 10K, the next big one.", category: "Adventure", targetDate: noonUtc(day(270)) },
    { title: "Take my parents to Japan", description: "Cherry blossom season. Mom has wanted this for years.", category: "Family", targetDate: noonUtc(`${thisYear + 1}-04-01`) },
    { title: "Learn to play the piano", description: "Enough to play 'Clair de Lune' badly but happily.", category: "Learning", targetDate: noonUtc(`${thisYear + 1}-12-31`) },
    { title: "Scuba dive in the Andamans", description: "Havelock Island. Saw a turtle on the second dive!", category: "Adventure", completedAt: noonUtc(`${thisYear - 2}-03-10`) },
    { title: "Publish a design case study", description: "The calendar redesign story.", category: "Career", completedAt: noonUtc(day(-5)) },
  ].map((b, i) => ({ ...b, userId, isDemo, sortOrder: i, createdAt: at(-40 + i, "10:00") }));

  const timeline: Prisma.TimelineEventCreateManyInput[] = [
    { title: "Born in Pune", description: "A monsoon baby, apparently in the middle of a power cut.", date: noonUtc("1994-01-01"), datePrecision: "year", category: "Childhood" },
    { title: "First day of school", description: "Cried at the gate, made a best friend by lunch.", date: noonUtc("2000-06-01"), datePrecision: "month", category: "Childhood" },
    { title: "Learned to swim at summer camp", date: noonUtc("2005-01-01"), datePrecision: "year", category: "Childhood" },
    { title: "Won the inter-school science fair", description: "A solar-powered water purifier made from biscuit tins.", date: noonUtc("2008-11-01"), datePrecision: "month", category: "Achievements" },
    { title: "Started design school", description: "Moved to Ahmedabad for a B.Des in communication design.", date: noonUtc("2012-07-01"), datePrecision: "month", category: "Education" },
    { title: "Backpacked across the Northeast", description: "Three weeks, five states, one very patient rucksack.", date: noonUtc("2015-12-01"), datePrecision: "month", category: "Travel" },
    { title: "First job as a junior designer", date: noonUtc("2016-06-15"), datePrecision: "day", category: "Career" },
    { title: "Moved to Bengaluru", description: "Two suitcases and a plant.", date: noonUtc("2019-03-14"), datePrecision: "day", category: "Personal" },
    { title: "Adopted Biscuit", description: "A scruffy indie pup from the shelter. Best decision ever.", date: noonUtc("2021-02-20"), datePrecision: "day", category: "Family" },
    { title: "Promoted to Senior Product Designer", date: noonUtc("2023-09-01"), datePrecision: "month", category: "Career" },
    { title: "Ran my first 5K without stopping", date: noonUtc(day(-3)), datePrecision: "day", category: "Achievements" },
  ].map((t, i) => ({ ...t, userId, isDemo, createdAt: at(-30, `10:${String(i).padStart(2, "0")}`) }));

  const memories: Prisma.MemoryCreateManyInput[] = [
    { title: "Sunset at Nandi Hills", caption: "Woke up at 4 AM for this. Worth every minute.", date: zonedToUtc(day(-24), "12:00", tz), location: "Nandi Hills, Karnataka", favorite: true },
    { title: "Biscuit's third birthday", caption: "A dog-safe cake and far too many photos.", date: zonedToUtc(day(-45), "12:00", tz), location: "Home" },
    { title: "Dinner with the design team", caption: "Celebrating the launch. Someone ordered every dessert on the menu.", date: zonedToUtc(day(-9), "12:00", tz), location: "Indiranagar, Bengaluru" },
  ].map((m) => ({ ...m, userId, isDemo }));

  // Weekly review for last week (weeks start on Monday by default).
  const ws = (await db.userSettings.findUnique({ where: { userId }, select: { weekStart: true } }))?.weekStart ?? 1;
  const thisWeek = addDaysKey(today, -((weekdayOfKey(today) - ws + 7) % 7));
  const review: Prisma.WeeklyReviewCreateManyInput = {
    userId,
    weekStart: addDaysKey(thisWeek, -7),
    rating: 4,
    wins: DEMO_REVIEW_WINS,
    challenges: "Too many meetings midweek; deep work suffered.",
    lessons: "Protect mornings. Saying no is a skill.",
    nextWeekFocus: "Outline case study two and keep three runs on the calendar.",
  };

  await db.journalEntry.createMany({ data: journalRows });
  await Promise.all([
    db.journalTag.createMany({ data: journalTags, skipDuplicates: true }),
    db.gratitudeEntry.createMany({ data: gratitude, skipDuplicates: true }),
    db.moodEntry.createMany({ data: moods }),
    db.bucketItem.createMany({ data: bucket }),
    db.timelineEvent.createMany({ data: timeline }),
    db.memory.createMany({ data: memories }),
    db.weeklyReview.createMany({ data: [review], skipDuplicates: true }),
  ]);
}

/** Plain text of a TipTap JSON document, for search. */
function docText(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const o = n as { type?: string; text?: string; content?: unknown[] };
    if (typeof o.text === "string") out.push(o.text);
    if (Array.isArray(o.content)) {
      o.content.forEach(walk);
      if (o.type && o.type !== "text" && o.type !== "doc") out.push("\n");
    }
  };
  walk(node);
  return out.join("").replace(/\n{2,}/g, "\n").trim();
}

function nextSlot(hours: number) {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export async function clearDemoData(userId: string) {
  const where = { userId, isDemo: true };
  await db.$transaction([
    db.task.deleteMany({ where }),
    db.goal.deleteMany({ where }),
    db.reminder.deleteMany({ where }),
    db.calendarEvent.deleteMany({ where }),
    db.habit.deleteMany({ where }),
    db.note.deleteMany({ where }),
    db.vaultItem.deleteMany({ where }),
    db.journalEntry.deleteMany({ where }),
    db.gratitudeEntry.deleteMany({ where }),
    db.moodEntry.deleteMany({ where }),
    db.bucketItem.deleteMany({ where }),
    db.timelineEvent.deleteMany({ where }),
    db.memory.deleteMany({ where }),
    // No isDemo column: only the untouched sample review (recognised by its text).
    db.weeklyReview.deleteMany({ where: { userId, wins: DEMO_REVIEW_WINS } }),
  ]);
  await db.tag.deleteMany({ where: { userId, name: { in: DEMO_JOURNAL_TAGS }, tasks: { none: {} }, notes: { none: {} }, journalEntries: { none: {} } } });
  // Sample categories and project aren't flagged isDemo; remove them only if nothing uses them any more.
  await db.category.deleteMany({
    where: { userId, name: { in: ["Work", "Personal", "Health"] }, tasks: { none: {} }, events: { none: {} }, notes: { none: {} } },
  });
  await db.project.deleteMany({ where: { userId, name: "Portfolio refresh", tasks: { none: {} } } });
}

/** True while any sample row remains. */
export async function hasDemoData(userId: string) {
  const where = { userId, isDemo: true };
  const counts = await Promise.all([
    db.task.count({ where }),
    db.goal.count({ where }),
    db.reminder.count({ where }),
    db.calendarEvent.count({ where }),
    db.habit.count({ where }),
    db.note.count({ where }),
    db.vaultItem.count({ where }),
    db.journalEntry.count({ where }),
    db.gratitudeEntry.count({ where }),
    db.moodEntry.count({ where }),
    db.bucketItem.count({ where }),
    db.timelineEvent.count({ where }),
    db.memory.count({ where }),
    db.weeklyReview.count({ where: { userId, wins: DEMO_REVIEW_WINS } }),
  ]);
  return counts.some((c) => c > 0);
}
