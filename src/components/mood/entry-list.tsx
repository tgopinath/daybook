"use client";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { DemoBadge } from "@/components/ui/misc";
import { confirm } from "@/components/ui/confirm";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { moodMeta } from "@/lib/moods";
import { INTENSITY_LABELS } from "@/lib/mood";
import { CheckinForm, moodTint, refreshMood } from "./checkin-form";
import type { MoodEntryDTO } from "./types";

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function dayHeading(key: string, todayKey?: string) {
  if (todayKey && key === todayKey) return "Today";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", ...(todayKey && key.slice(0, 4) !== todayKey.slice(0, 4) ? { year: "numeric" } : {}) });
}

export async function deleteCheckin(e: MoodEntryDTO, after?: () => void) {
  const ok = await confirm({
    title: "Delete this check-in?",
    body: "It will be removed from your calendar and trends. This can't be undone.",
    destructive: true,
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await api.delete(`/api/mood/${e.id}`);
    toast.success("Check-in deleted");
    refreshMood();
    after?.();
  } catch (err) {
    toastError(err);
  }
}

export function EntryRow({ entry, onEdit, showDate }: { entry: MoodEntryDTO; onEdit: (e: MoodEntryDTO) => void; showDate?: boolean }) {
  const m = moodMeta(entry.mood);
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[24px]" style={{ background: moodTint(entry.mood) }} aria-hidden>
        {m?.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[14px] font-semibold text-fg">{m?.label ?? entry.mood}</span>
          <span className="text-[12px] text-fg-3">
            {INTENSITY_LABELS[entry.intensity]} · {showDate ? `${dayHeading(entry.date)}, ` : ""}
            {timeFmt.format(new Date(entry.loggedAt))}
          </span>
          <DemoBadge show={entry.isDemo} />
        </div>
        {entry.note && <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-2">{entry.note}</p>}
        {(entry.factors.length > 0 || entry.journalEntry) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {entry.factors.map((f) => (
              <span key={f} className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 text-[12px] text-fg-2">
                {f}
              </span>
            ))}
            {entry.journalEntry && (
              <Link href={`/journal?id=${entry.journalEntry.id}`} className="inline-flex h-6 items-center gap-1 rounded-full px-1 text-[12px] font-medium text-primary hover:underline">
                <BookOpen className="h-3.5 w-3.5" /> {entry.journalEntry.title.trim() || "Journal entry"}
              </Link>
            )}
          </div>
        )}
      </div>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Check-in actions" className="shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
        items={[
          { label: "Edit", icon: Pencil, onSelect: () => onEdit(entry) },
          { label: "Delete", icon: Trash2, danger: true, onSelect: () => void deleteCheckin(entry) },
        ]}
      />
    </li>
  );
}

export function EditCheckinDialog({ entry, onClose }: { entry: MoodEntryDTO | null; onClose: () => void }) {
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()} title="Edit check-in" description={entry ? dayHeading(entry.date) : undefined} size="lg">
      {entry && <CheckinForm key={entry.id} entry={entry} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  );
}

export function useEditCheckin() {
  const [editing, setEditing] = useState<MoodEntryDTO | null>(null);
  return { editing, setEditing, dialog: <EditCheckinDialog entry={editing} onClose={() => setEditing(null)} /> };
}
