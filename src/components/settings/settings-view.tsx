"use client";
import { useEffect, useState } from "react";
import { Bell, Database, Palette, Timer, User } from "lucide-react";
import { useMe } from "@/lib/use-me";
import { Card, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { ProfileSection } from "./profile-section";
import { AppearanceSection, NotificationsSection, ProductivitySection } from "./preferences-sections";
import { DataSection } from "./data-section";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "productivity", label: "Productivity", icon: Timer },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data", icon: Database },
];

export function SettingsView() {
  const { data: me, error } = useMe();
  const [active, setActive] = useState("profile");

  // Deep links like /settings#data scroll once the content has rendered.
  useEffect(() => {
    if (!me) return;
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [!!me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight the section in view.
  useEffect(() => {
    if (!me) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [!!me]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your profile, preferences and data." />
      <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-10">
        <nav aria-label="Settings sections" className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:mb-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0 scroll-thin">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                jump(s.id);
              }}
              aria-current={active === s.id ? "true" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                active === s.id ? "bg-surface-2 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </a>
          ))}
        </nav>
        <div className="flex max-w-[760px] min-w-0 flex-col gap-8">
          {error && !me ? (
            <Card className="p-6 text-sm text-danger">Couldn&apos;t load your settings. {error.message}</Card>
          ) : !me ? (
            SECTIONS.map((s) => (
              <div key={s.id} id={s.id} className="flex flex-col gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-40 w-full rounded-[14px]" />
              </div>
            ))
          ) : (
            <>
              <ProfileSection me={me} />
              <AppearanceSection me={me} />
              <ProductivitySection me={me} />
              <NotificationsSection me={me} />
              <DataSection me={me} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
