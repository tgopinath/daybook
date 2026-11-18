"use client";
import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { api, refresh, SUMMARY_KEYS } from "@/lib/client";
import { habitsDailyMessage, habitStats } from "@/lib/habits";
import { toast, toastError } from "@/components/ui/toast";
import type { HabitItem, HabitList } from "./types";

export const HABITS_KEY = "/api/habits";

/** Applies a check-in locally, mirroring the server rules, and recomputes stats. */
export function applyCheckin(h: HabitItem, date: string, delta?: 1 | -1): HabitItem {
  const target = Math.max(1, h.targetPerDay);
  const current = h.entries.find((e) => e.date === date)?.count ?? 0;
  const next = delta === undefined ? (current >= target ? 0 : target) : Math.max(0, Math.min(Math.max(target * 2, target + 10), current + delta));
  const entries = h.entries.filter((e) => e.date !== date);
  if (next > 0) entries.push({ date, count: next });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const startKey = date < h.startKey ? date : h.startKey;
  return { ...h, entries, ...habitStats(entries, h, h.todayKey, { startKey }) };
}

function withSummary(list: HabitList, items: HabitItem[]): HabitList {
  const due = items.filter((h) => h.scheduledToday);
  return {
    ...list,
    items,
    summary: {
      scheduledToday: due.length,
      doneToday: due.filter((h) => h.doneToday).length,
      bestCurrentStreak: items.reduce((m, h) => Math.max(m, h.streak), 0),
      message: habitsDailyMessage(items),
    },
  };
}

/** Optimistic check-in: updates the cached list immediately, then reconciles with the server. */
export function useCheckin() {
  const { mutate } = useSWRConfig();
  return useCallback(
    async (habit: HabitItem, date: string = habit.todayKey, delta?: 1 | -1) => {
      const optimistic = applyCheckin(habit, date, delta);
      const update = (fn: (h: HabitItem) => HabitItem) =>
        mutate<HabitList>(HABITS_KEY, (list) => (list ? withSummary(list, list.items.map((h) => (h.id === habit.id ? fn(h) : h))) : list), { revalidate: false });
      await update((h) => applyCheckin(h, date, delta));
      // Detail cache (if open) follows too.
      void mutate(`/api/habits/${habit.id}`, (d: { item: HabitItem } | undefined) => (d ? { item: { ...d.item, ...applyCheckin(d.item, date, delta) } } : d), { revalidate: false });
      try {
        const res = await api.post<{ item: HabitItem }>(`/api/habits/${habit.id}/checkin`, { date, ...(delta ? { delta } : {}) });
        await update(() => res.item);
        if (optimistic.doneToday && !habit.doneToday && date === habit.todayKey && res.item.streak >= 2 && res.item.streak === res.item.bestStreak && res.item.streak > habit.bestStreak) {
          toast.success(`New best streak: ${res.item.streak} days`);
        }
        void refresh(`/api/habits/${habit.id}`, ...SUMMARY_KEYS);
        return res.item;
      } catch (err) {
        await update(() => habit);
        void refresh(`/api/habits/${habit.id}`);
        toastError(err);
        return null;
      }
    },
    [mutate],
  );
}

export async function archiveHabit(h: Pick<HabitItem, "id" | "name">, archived = true) {
  try {
    await api.patch(`/api/habits/${h.id}`, { archived });
    await refresh(HABITS_KEY, "/api/reminders", ...SUMMARY_KEYS);
    if (archived) toast.undo(`Archived “${h.name}”`, () => void archiveHabit(h, false));
    else toast.success("Habit restored");
  } catch (err) {
    toastError(err);
  }
}

export async function deleteHabit(h: Pick<HabitItem, "id" | "name">) {
  try {
    await api.delete(`/api/habits/${h.id}`);
    await refresh(HABITS_KEY, "/api/reminders", ...SUMMARY_KEYS);
    toast.undo(`Deleted “${h.name}”`, async () => {
      try {
        await api.patch(`/api/habits/${h.id}`, { deletedAt: null });
        await refresh(HABITS_KEY, "/api/reminders", ...SUMMARY_KEYS);
        toast.success("Habit restored");
      } catch (err) {
        toastError(err);
      }
    });
  } catch (err) {
    toastError(err);
  }
}
