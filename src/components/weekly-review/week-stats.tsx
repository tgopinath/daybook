"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, BookOpen, CheckCircle2, Flag, Heart, Image as ImageIcon, Lock, Map, Repeat, Smile, Sparkles, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui/misc";
import { moodMeta } from "@/lib/moods";
import { scoreWord } from "@/lib/mood";
import { cn } from "@/lib/utils";
import { axisProps, ChartTooltip, useChartColors } from "@/components/dashboard/chart-kit";
import type { WeekInfo, WeekStats } from "./types";

function Section({ icon: Icon, title, children, action, className }: { icon: typeof Smile; title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={cn("min-w-0 p-4 md:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <Icon className="h-4 w-4 text-primary" aria-hidden /> {title}
        </h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-[13px] leading-relaxed text-fg-3">{children}</p>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface p-3">
      <div className="text-[12px] font-medium text-fg-2">{label}</div>
      <div className="font-display mt-1 text-[22px] leading-tight font-semibold text-fg tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-fg-3">{sub}</div>}
    </div>
  );
}

const SeeAll = ({ href, label = "Open" }: { href: string; label?: string }) => (
  <Link href={href} className="text-[12.5px] font-medium text-primary hover:underline">
    {label}
  </Link>
);

export function WeekStatsView({ week, stats }: { week: WeekInfo; stats: WeekStats }) {
  const c = useChartColors();
  const ax = axisProps(c);
  const s = stats;
  const moodData = s.mood.days.map((d) => ({ ...d, fullLabel: d.label, value: d.score }));
  const days = week.daysElapsed;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="Tasks done" value={String(s.tasks.completed)} sub={`${s.tasks.created} added`} />
        <Stat label="Habit consistency" value={s.habits.rate != null ? `${s.habits.rate}%` : "—"} sub={s.habits.scheduled ? `${s.habits.done} of ${s.habits.scheduled} habit-days` : "Nothing scheduled"} />
        <Stat label="Mood" value={s.mood.avgScore != null ? `${s.mood.avgScore}/5` : "—"} sub={s.mood.checkins ? `${scoreWord(s.mood.avgScore)} · ${s.mood.checkins} check-ins` : "No check-ins"} />
        <Stat label="Journal" value={`${s.journal.days}/${days || 7}`} sub={`days · ${s.journal.words.toLocaleString()} words`} />
        <Stat label="Gratitude" value={`${s.gratitude.days}/${days || 7}`} sub="days" />
        <Stat label="Memories" value={String(s.memories.count)} sub={`${s.timeline.added} timeline · ${s.bucket.completed.length} bucket`} />
      </div>

      {s.attention.length > 0 && (
        <Section icon={AlertCircle} title="Areas needing attention">
          <ul className="flex flex-col gap-1.5">
            {s.attention.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-center gap-2 rounded-[10px] bg-warning-soft px-3 py-2 text-[14px] text-fg hover:underline">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.achievements.length > 0 && (
        <Section icon={Trophy} title="Achievements">
          <ul className="flex flex-col divide-y divide-line">
            {s.achievements.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 py-2">
                {a.type === "bucket" ? <Map className="h-4 w-4 shrink-0 text-success" /> : a.type === "goal" ? <Target className="h-4 w-4 shrink-0 text-success" /> : <Flag className="h-4 w-4 shrink-0 text-success" />}
                <Link href={a.href} className="min-w-0 flex-1 truncate text-[14px] text-fg hover:underline">
                  {a.title}
                </Link>
                {a.detail && <span className="shrink-0 truncate text-[12px] text-fg-3">{a.detail}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section icon={CheckCircle2} title="Tasks completed" action={<SeeAll href="/tasks" />}>
          {s.tasks.top.length ? (
            <ul className="flex flex-col gap-1.5">
              {s.tasks.top.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[14px]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0 truncate text-fg">{t.title}</span>
                </li>
              ))}
              {s.tasks.completed > s.tasks.top.length && <li className="text-[12px] text-fg-3">+{s.tasks.completed - s.tasks.top.length} more</li>}
            </ul>
          ) : (
            <Muted>No tasks completed this week{week.isCurrent ? " yet" : ""}.</Muted>
          )}
        </Section>

        <Section icon={Target} title="Goals" action={<SeeAll href="/goals" />}>
          {s.goals.moved.length || s.goals.milestones.length || s.goals.completed.length ? (
            <ul className="flex flex-col gap-2">
              {s.goals.completed.map((g) => (
                <li key={g.id} className="text-[14px] text-fg">
                  <span className="font-medium text-success">Completed:</span> {g.title}
                </li>
              ))}
              {s.goals.moved.map((g) => (
                <li key={g.id} className="flex items-center gap-2 text-[14px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg">{g.title}</span>
                  <span className="shrink-0 text-[12px] text-fg-2 tabular-nums">
                    {g.from} → {g.to}
                    {g.unit ? ` ${g.unit}` : ""}
                  </span>
                </li>
              ))}
              {s.goals.milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-[14px]">
                  <Flag className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0 truncate text-fg">{m.title}</span>
                  <span className="shrink-0 truncate text-[12px] text-fg-3">{m.goalTitle}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No goal progress logged this week.</Muted>
          )}
        </Section>

        <Section icon={Repeat} title="Habits" action={<SeeAll href="/habits" />}>
          {s.habits.perHabit.length ? (
            <ul className="flex flex-col gap-2.5">
              {s.habits.perHabit.map((h) => (
                <li key={h.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[14px]">
                    <span className="min-w-0 truncate text-fg">{h.name}</span>
                    <span className="shrink-0 text-[12px] text-fg-2 tabular-nums">{h.rate != null ? `${h.rate}%` : "—"}</span>
                  </div>
                  <div className="flex gap-1" aria-label={`${h.name}: ${h.done} of ${h.scheduled} days`}>
                    {h.days.map((d, i) => (
                      <span
                        key={i}
                        className={cn("h-2.5 flex-1 rounded-full", d === true ? "" : d === false ? "bg-line-strong" : "border border-dashed border-line")}
                        style={d === true ? { background: h.color } : undefined}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No habits yet.</Muted>
          )}
        </Section>

        <Section icon={Smile} title="Mood pattern" action={<SeeAll href="/mood" />}>
          {s.mood.checkins ? (
            <>
              <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                {s.mood.days.map((d) => {
                  const m = moodMeta(d.mood);
                  return (
                    <div key={d.key} className="flex flex-col items-center gap-0.5">
                      <span className="text-[20px] leading-none" aria-label={m ? `${d.label}: ${m.label}` : `${d.label}: no check-in`}>
                        {m ? m.emoji : <span className="text-[14px] text-fg-3">·</span>}
                      </span>
                      <span className="text-[11px] text-fg-3">{d.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moodData} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                    <XAxis dataKey="label" {...ax} hide />
                    <YAxis {...ax} domain={[0, 5]} ticks={[1, 3, 5]} />
                    <Tooltip content={<ChartTooltip format={(v) => `${v} · ${scoreWord(v)}`} />} cursor={{ fill: c.surface2 }} />
                    <Bar dataKey="value" name="Mood" radius={[5, 5, 0, 0]} barSize={18}>
                      {moodData.map((d) => (
                        <Cell key={d.key} fill={moodMeta(d.mood)?.color ?? c.primary} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {s.mood.distribution.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.mood.distribution.map((d) => (
                    <span key={d.mood} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[12px] text-fg-2">
                      <span aria-hidden>{d.emoji}</span> {d.label} ×{d.count}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Muted>No mood check-ins this week{week.isCurrent ? " yet" : ""}.</Muted>
          )}
        </Section>

        <Section icon={BookOpen} title="Journal highlights" action={<SeeAll href="/journal" />}>
          {s.journal.items.length ? (
            <ul className="flex flex-col gap-1.5">
              {s.journal.items.slice(0, 7).map((j) => (
                <li key={j.id} className="flex items-center gap-2 text-[14px]">
                  {j.isPrivate ? <Lock className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-label="Private" /> : <BookOpen className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />}
                  <Link href={`/journal?id=${j.id}`} className="min-w-0 flex-1 truncate text-fg hover:underline">
                    {j.title || "Untitled entry"}
                  </Link>
                  <span className="shrink-0 text-[12px] text-fg-3">{new Date(`${j.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No journal entries this week{week.isCurrent ? " yet" : ""}.</Muted>
          )}
        </Section>

        <Section icon={Heart} title="Life moments">
          <ul className="flex flex-col gap-2 text-[14px]">
            <li className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
              <span className="flex-1 text-fg">Gratitude on {s.gratitude.days} {s.gratitude.days === 1 ? "day" : "days"}</span>
              <SeeAll href="/gratitude" />
            </li>
            <li className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-fg">
                {s.memories.count ? `${s.memories.count} ${s.memories.count === 1 ? "memory" : "memories"}: ${s.memories.items.map((m) => m.title).join(", ")}` : "No new memories"}
              </span>
              <SeeAll href="/memories" />
            </li>
            <li className="flex items-center gap-2">
              <Map className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-fg">
                {s.bucket.completed.length ? `Bucket list: ${s.bucket.completed.map((b) => b.title).join(", ")}` : "No bucket list items ticked off"}
              </span>
              <SeeAll href="/bucket-list" />
            </li>
            <li className="flex items-center gap-2">
              <Flag className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-fg">
                {s.timeline.added ? `${s.timeline.added} timeline ${s.timeline.added === 1 ? "event" : "events"} added` : "No timeline events added"}
              </span>
              <SeeAll href="/timeline" />
            </li>
          </ul>
        </Section>
      </div>

    </div>
  );
}
