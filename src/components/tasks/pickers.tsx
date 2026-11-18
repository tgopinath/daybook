"use client";
import * as P from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";
import { CalendarDays, CalendarX2, Flag, Sun, Sunrise, Sofa, CalendarClock, X } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { PRIORITY_META } from "@/components/ui/misc";
import { useTz } from "@/lib/use-me";
import { useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { quickDays } from "./utils";
import type { Priority } from "./types";

/* ---------------------------------------------------------------- */

export function Popover({ trigger, children, align = "end", className }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: "start" | "center" | "end"; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn("z-[60] rounded-xl border border-line bg-surface p-1 shadow-pop outline-none data-[state=open]:animate-[popIn_.12s_ease-out]", className)}
        >
          {children(() => setOpen(false))}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/* ---------------------------------------------------------------- */

export function PriorityFlag({ priority, className }: { priority: Priority; className?: string }) {
  const m = PRIORITY_META[priority];
  return <Flag aria-label={`${m.label} priority`} className={cn("h-3.5 w-3.5", className)} style={{ color: m.color }} fill={priority === "LOW" ? "none" : m.color} />;
}

export function PriorityMenu({ value, onChange, trigger }: { value: Priority; onChange: (p: Priority) => void; trigger: ReactNode }) {
  return (
    <Menu
      trigger={trigger}
      items={[
        { type: "label", label: "Priority" },
        ...(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => ({
          label: PRIORITY_META[p].label + (p === value ? "  ✓" : ""),
          icon: Flag,
          onSelect: () => onChange(p),
        })),
      ]}
    />
  );
}

/* ---------------------------------------------------------------- */

/** Popover with quick due-date choices + a date input. onChange gets yyyy-MM-dd or null. */
export function DueMenu({ value, onChange, trigger }: { value: string | null; onChange: (day: string | null) => void; trigger: ReactNode }) {
  const tz = useTz();
  const icons = [Sun, Sunrise, Sofa, CalendarClock];
  return (
    <Popover trigger={trigger} className="w-[220px]">
      {(close) => (
        <div className="flex flex-col">
          {quickDays(tz).map((q, i) => {
            const Icon = icons[i]!;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  onChange(q.key);
                  close();
                }}
                className={cn("flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-surface-2", value === q.key && "text-primary")}
              >
                <Icon className="h-4 w-4 opacity-70" />
                <span className="flex-1">{q.label}</span>
                <span className="text-[11px] text-fg-3">{q.key.slice(5).replace("-", "/")}</span>
              </button>
            );
          })}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                close();
              }}
              className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] text-fg-2 hover:bg-surface-2"
            >
              <CalendarX2 className="h-4 w-4 opacity-70" /> No date
            </button>
          )}
          <div className="my-1 h-px bg-line" />
          <label className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-fg-3">
            <CalendarDays className="h-4 w-4" />
            <input
              type="date"
              defaultValue={value ?? ""}
              onChange={(e) => {
                if (e.target.value) {
                  onChange(e.target.value);
                  close();
                }
              }}
              className="h-7 flex-1 rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-fg outline-none focus:border-primary"
            />
          </label>
        </div>
      )}
    </Popover>
  );
}

/* ---------------------------------------------------------------- */

/** Chip input: Enter or comma adds a tag; suggestions from /api/tags. Creates tags on save. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const { data } = useApi<{ items: { id: string; name: string }[] }>("/api/tags");
  const lower = new Set(value.map((v) => v.toLowerCase()));
  const suggestions = (data?.items ?? []).filter((t) => !lower.has(t.name.toLowerCase()) && (!text || t.name.toLowerCase().includes(text.toLowerCase()))).slice(0, 6);
  const add = (name: string) => {
    const n = name.trim().replace(/^#/, "").slice(0, 40);
    if (n && !lower.has(n.toLowerCase())) onChange([...value, n]);
    setText("");
  };
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2 py-1 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
        {value.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-2 text-[12px] text-fg-2">
            #{t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="rounded p-0.5 hover:bg-line">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? "" : "Add tags…"}
          aria-label="Add tag"
          className="h-7 min-w-[90px] flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => add(s.name)} className="h-6 rounded-md border border-dashed border-line px-1.5 text-[11.5px] text-fg-3 hover:border-primary hover:text-primary">
              #{s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
