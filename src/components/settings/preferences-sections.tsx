"use client";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { Me } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { Badge, Segmented } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Row, Section, useSaveSettings, type SettingsPatch } from "./shared";

const ACCENTS = [
  { name: "Indigo", value: "#635BFF" },
  { name: "Blue", value: "#2F80ED" },
  { name: "Teal", value: "#14A38B" },
  { name: "Green", value: "#20A779" },
  { name: "Amber", value: "#D9822B" },
  { name: "Rose", value: "#E0457B" },
];

export function AppearanceSection({ me }: { me: Me }) {
  const save = useSaveSettings();
  const s = me.settings;
  const custom = !ACCENTS.some((a) => a.value.toLowerCase() === s.accentColor.toLowerCase());
  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <Section id="appearance" title="Appearance" description="Changes apply instantly on this and your other devices.">
      <Row label="Theme" stack>
        <div className="grid grid-cols-3 gap-2 sm:max-w-[420px]" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={s.theme === t.value}
              onClick={() => save({ theme: t.value })}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[13px] font-medium transition-colors",
                s.theme === t.value ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent color">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => {
            const active = a.value.toLowerCase() === s.accentColor.toLowerCase();
            return (
              <button
                key={a.value}
                role="radio"
                aria-checked={active}
                aria-label={a.name}
                title={a.name}
                onClick={() => save({ accentColor: a.value })}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
                style={{ background: a.value, boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${a.value}` : undefined }}
              >
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
          <label
            title="Custom color"
            className={cn("relative flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-[12px] text-fg-2 hover:text-fg", custom ? "border-primary text-primary" : "border-line")}
          >
            <span className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: custom ? s.accentColor : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} />
            Custom
            <input
              type="color"
              aria-label="Custom accent color"
              value={s.accentColor.length === 7 ? s.accentColor : "#635BFF"}
              onChange={(e) => save({ accentColor: e.target.value.toUpperCase() })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </Row>
      <Row label="Layout density" hint="Compact fits more on screen.">
        <Segmented
          value={s.density as "comfortable" | "compact"}
          onChange={(density) => save({ density })}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </Row>
    </Section>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function TimeInput({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      type="time"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v && v !== value && onCommit(v)}
      className="w-[120px]"
    />
  );
}

export function ProductivitySection({ me }: { me: Me }) {
  const saveRaw = useSaveSettings();
  const s = me.settings;
  const save = (patch: SettingsPatch) => saveRaw(patch).then((ok) => ok && toast.success("Saved", { duration: 1500 }));
  return (
    <Section id="productivity" title="Productivity" description="Defaults used by tasks, the planner and the AI assistant.">
      <Row label="Default task priority">
        <div className="w-[160px]">
          <Select aria-label="Default task priority" value={s.defaultPriority} onChange={(e) => save({ defaultPriority: e.target.value as "HIGH" | "MEDIUM" | "LOW" })}>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </div>
      </Row>
      <Row label="Working hours" hint="Used to plan your day and avoid scheduling outside them.">
        <div className="flex items-center gap-2">
          <TimeInput label="Work starts" value={s.workStart} onCommit={(workStart) => save({ workStart })} />
          <span className="text-fg-3">–</span>
          <TimeInput label="Work ends" value={s.workEnd} onCommit={(workEnd) => save({ workEnd })} />
        </div>
      </Row>
      <Row label="Week starts on">
        <div className="w-[160px]">
          <Select aria-label="Week starts on" value={String(s.weekStart)} onChange={(e) => save({ weekStart: Number(e.target.value) })}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      </Row>
      <Row label="Daily planning time" hint="When the planner nudges you to plan your day.">
        <TimeInput label="Daily planning time" value={s.planningTime} onCommit={(planningTime) => save({ planningTime })} />
      </Row>
    </Section>
  );
}

type Perm = NotificationPermission | "unsupported" | "loading";

async function requestPermission() {
  // Prefer the notifications module's helper (it also re-registers push) when it exists.
  try {
    const mod = (await import("@/components/notifications/reminder-runner")) as Record<string, unknown>;
    const fn = mod.requestNotificationPermission;
    if (typeof fn === "function") {
      await (fn as () => Promise<unknown>)();
      return Notification.permission;
    }
  } catch {}
  return Notification.requestPermission();
}

export function NotificationsSection({ me }: { me: Me }) {
  const saveRaw = useSaveSettings();
  const s = me.settings;
  const save = (patch: SettingsPatch) => saveRaw(patch);
  const [perm, setPerm] = useState<Perm>("loading");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setPerm(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const enable = async () => {
    setAsking(true);
    try {
      const p = await requestPermission();
      setPerm(p);
      if (p === "granted") {
        if (!s.browserNotifications) await save({ browserNotifications: true });
        toast.success("Browser notifications are on");
      } else if (p === "denied") toast.error("Notifications are blocked in your browser settings");
    } catch (err) {
      toastError(err);
    } finally {
      setAsking(false);
    }
  };

  const permBadge =
    perm === "granted" ? (
      <Badge tone="success">Allowed</Badge>
    ) : perm === "denied" ? (
      <Badge tone="danger">Blocked</Badge>
    ) : perm === "unsupported" ? (
      <Badge>Not supported</Badge>
    ) : perm === "default" ? (
      <Badge tone="warning">Not asked yet</Badge>
    ) : null;

  const toggles: { key: "notifyOverdue" | "notifyHabits" | "notifyCalendar" | "notifyAI"; label: string; hint: string }[] = [
    { key: "notifyOverdue", label: "Overdue tasks", hint: "When a task passes its due time." },
    { key: "notifyHabits", label: "Habit reminders", hint: "At each habit's reminder time." },
    { key: "notifyCalendar", label: "Calendar events", hint: "Before events start." },
    { key: "notifyAI", label: "AI suggestions", hint: "Occasional planning tips from the assistant." },
  ];

  return (
    <Section id="notifications" title="Notifications" description="Choose what MyDiary tells you about, and how.">
      <Row
        label={
          <span className="flex items-center gap-2">
            Browser notifications {permBadge}
          </span>
        }
        hint={
          perm === "denied"
            ? "Your browser is blocking notifications for this site. Allow them in the site settings, then reload."
            : perm === "unsupported"
              ? "This browser doesn't support notifications. In-app alerts still work."
              : "Show reminders and alerts even when MyDiary is in the background."
        }
      >
        <div className="flex items-center gap-3">
          {perm === "default" && (
            <Button size="sm" variant="outline" onClick={enable} loading={asking}>
              Enable
            </Button>
          )}
          <Switch checked={s.browserNotifications} onChange={(v) => save({ browserNotifications: v })} label="Browser notifications" />
        </div>
      </Row>
      <Row label="Reminder lead time" hint="How early to alert you before a reminder or event.">
        <div className="w-[160px]">
          <Select aria-label="Reminder lead time" value={String(s.reminderLeadMinutes)} onChange={(e) => save({ reminderLeadMinutes: Number(e.target.value) })}>
            {[0, 5, 10, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "At the time" : m < 60 ? `${m} minutes before` : `${m / 60} hour${m > 60 ? "s" : ""} before`}
              </option>
            ))}
            {![0, 5, 10, 15, 30, 60, 120].includes(s.reminderLeadMinutes) && <option value={s.reminderLeadMinutes}>{s.reminderLeadMinutes} minutes before</option>}
          </Select>
        </div>
      </Row>
      <Row label="Default snooze">
        <div className="w-[160px]">
          <Select aria-label="Default snooze" value={String(s.defaultSnoozeMinutes)} onChange={(e) => save({ defaultSnoozeMinutes: Number(e.target.value) })}>
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : "1 hour"}
              </option>
            ))}
            {![5, 10, 15, 30, 60].includes(s.defaultSnoozeMinutes) && <option value={s.defaultSnoozeMinutes}>{s.defaultSnoozeMinutes} minutes</option>}
          </Select>
        </div>
      </Row>
      {toggles.map((t) => (
        <Row key={t.key} label={t.label} hint={t.hint}>
          <Switch checked={s[t.key]} onChange={(v) => save({ [t.key]: v })} label={t.label} />
        </Row>
      ))}
      <Row label="Email notifications" hint="Email delivery isn't configured on this server.">
        <div className="pointer-events-none opacity-50" aria-disabled="true" title="Email delivery isn't configured on this server">
          <Switch checked={false} onChange={() => {}} label="Email notifications (unavailable)" />
        </div>
      </Row>
    </Section>
  );
}
