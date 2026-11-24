// Gratitude journal helpers shared by the API, the gratitude UI and other modules
// (dashboard, weekly review). Pure functions only: safe on the server and the client.

import { addDaysKey } from "./time";

export const GRATITUDE_PAGE_SIZE = 30;
export const GRATITUDE_MAX_ITEMS = 3;

/** Gentle daily prompts, rotated deterministically by day key. */
export const GRATITUDE_PROMPTS = [
  "Who made you smile today?",
  "What small comfort did you enjoy today?",
  "What's something you're looking forward to?",
  "Which moment today would you like to remember?",
  "What did your body let you do today?",
  "Who is someone you're glad is in your life?",
  "What made today a little easier?",
  "What's a simple pleasure you noticed today?",
  "What's something beautiful you saw today?",
  "What did you learn today?",
  "Which meal or drink did you enjoy recently?",
  "What's a kindness someone showed you?",
  "What's a kindness you showed someone else?",
  "What sound, smell or taste made you happy today?",
  "Which part of your home do you love most?",
  "What's a challenge that helped you grow?",
  "Who taught you something valuable?",
  "What made you laugh recently?",
  "What's something you have now that you once wished for?",
  "What about today's weather can you appreciate?",
  "Which song, book or show lifted your mood?",
  "What's a skill you're grateful to have?",
  "Who could you thank today, and for what?",
  "What went better than expected today?",
  "What's a place that makes you feel calm?",
  "Which friend always shows up for you?",
  "What's something in nature you're thankful for?",
  "What tiny win did you have today?",
  "What's a memory that still makes you smile?",
  "What did you do today just for yourself?",
  "What's an everyday thing you'd miss if it were gone?",
  "Who helped you without being asked?",
  "What are you proud of this week?",
  "What gave you energy today?",
  "What's a tradition or ritual you cherish?",
  "Which conversation today felt good?",
  "What's something about your work you appreciate?",
  "How did you rest or recharge today?",
  "What opportunity are you thankful for?",
  "What about this moment, right now, is good?",
] as const;

/** Stable prompt for a yyyy-MM-dd day key (same day → same prompt). */
export function promptForDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const days = Math.floor(Date.UTC(y || 1970, (m || 1) - 1, d || 1) / 86_400_000);
  const n = GRATITUDE_PROMPTS.length;
  // Multiplying by a number coprime to n spreads consecutive days across the list.
  return GRATITUDE_PROMPTS[(((days * 7) % n) + n) % n]!;
}

/** Non-empty, trimmed gratitude items. */
export function cleanItems(items: readonly string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean).slice(0, GRATITUDE_MAX_ITEMS);
}

/**
 * Current and best streaks of consecutive days in `dates` (yyyy-MM-dd keys of days with at least
 * one gratitude item). Today not filled yet doesn't break the current streak: it counts back from
 * yesterday in that case.
 */
export function gratitudeStreak(dates: readonly string[], todayKey: string): { current: number; best: number } {
  const set = new Set(dates.filter((d) => d <= todayKey));
  if (!set.size) return { current: 0, best: 0 };
  let current = 0;
  let day = set.has(todayKey) ? todayKey : addDaysKey(todayKey, -1);
  while (set.has(day)) {
    current++;
    day = addDaysKey(day, -1);
  }
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDaysKey(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves " +
    "im i'm ive i've id i'd ill i'll dont don't didnt didn't cant can't wont won't isnt isn't wasnt wasn't thats that's its it's " +
    "also really very much many lot lots got get getting gets made make making today yesterday tomorrow day days thing things something someone " +
    "grateful thankful gratitude thank thanks glad able being feel felt still even well way time new good great nice one two three"
  ).split(/\s+/),
);

/** Most frequent meaningful words across the texts (deterministic, no AI). */
export function topWords(texts: readonly string[], limit = 8): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const words = t.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    for (const raw of words) {
      const w = raw.replace(/[’]/g, "'").replace(/^'+|'+$/g, "").replace(/'s$/, "");
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
