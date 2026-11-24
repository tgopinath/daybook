// Shared mood metadata (journal, mood tracker, overview, weekly review).
export const MOODS = [
  { value: "happy", label: "Happy", emoji: "😊", color: "#F2B705", score: 5 },
  { value: "excited", label: "Excited", emoji: "🤩", color: "#F28C28", score: 5 },
  { value: "calm", label: "Calm", emoji: "😌", color: "#20A779", score: 4 },
  { value: "neutral", label: "Neutral", emoji: "😐", color: "#9A9EA6", score: 3 },
  { value: "sad", label: "Sad", emoji: "😢", color: "#4A7FE0", score: 2 },
  { value: "anxious", label: "Anxious", emoji: "😟", color: "#8B5CF6", score: 2 },
  { value: "stressed", label: "Stressed", emoji: "😣", color: "#E9A23B", score: 1 },
  { value: "angry", label: "Angry", emoji: "😠", color: "#E45D5D", score: 1 },
] as const;

export type Mood = (typeof MOODS)[number]["value"];
export const MOOD_VALUES = MOODS.map((m) => m.value) as [Mood, ...Mood[]];
export const moodMeta = (v: string | null | undefined) => MOODS.find((m) => m.value === v);
