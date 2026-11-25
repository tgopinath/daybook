"use client";
import {
  Apple, Bed, Bike, BookOpen, Brain, Check, Code, Coffee, Dumbbell, Footprints, GlassWater, Heart, Leaf, Moon, Music, PenLine, PhoneOff, PiggyBank, Pill, Sun,
  type LucideIcon,
} from "lucide-react";

/** Curated icon set for habits. Keys match HABIT_ICON_NAMES on the server. */
export const HABIT_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  check: { icon: Check, label: "Check" },
  dumbbell: { icon: Dumbbell, label: "Workout" },
  "book-open": { icon: BookOpen, label: "Read" },
  brain: { icon: Brain, label: "Mind" },
  "glass-water": { icon: GlassWater, label: "Water" },
  moon: { icon: Moon, label: "Sleep" },
  sun: { icon: Sun, label: "Morning" },
  footprints: { icon: Footprints, label: "Walk" },
  bike: { icon: Bike, label: "Ride" },
  apple: { icon: Apple, label: "Eat well" },
  heart: { icon: Heart, label: "Health" },
  pill: { icon: Pill, label: "Medication" },
  "pen-line": { icon: PenLine, label: "Journal" },
  music: { icon: Music, label: "Practice" },
  code: { icon: Code, label: "Code" },
  leaf: { icon: Leaf, label: "Mindful" },
  coffee: { icon: Coffee, label: "Less coffee" },
  "piggy-bank": { icon: PiggyBank, label: "Save" },
  "phone-off": { icon: PhoneOff, label: "Screen-free" },
  bed: { icon: Bed, label: "Rest" },
};

export const HABIT_COLORS = ["#993399", "#20A779", "#E9A23B", "#E45D5D", "#3B9BE9", "#8B5CF6", "#EC4899", "#14B8A6"];

export function HabitIcon({ name, className }: { name: string; className?: string }) {
  const I = HABIT_ICONS[name]?.icon ?? Check;
  return <I className={className} />;
}

/** Hex color with alpha (0–1). */
export function tint(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
