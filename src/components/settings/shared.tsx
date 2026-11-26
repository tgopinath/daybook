"use client";
import { useCallback, type ReactNode } from "react";
import { mutate } from "swr";
import type { UserSettings } from "@prisma/client";
import { api, refresh, type Wire } from "@/lib/client";
import { Card } from "@/components/ui/misc";
import { toastError } from "@/components/ui/toast";
import type { Me } from "@/lib/use-me";
import { cn } from "@/lib/utils";

export type SettingsPatch = Partial<Omit<Wire<UserSettings>, "id" | "userId" | "updatedAt" | "dailyFocus" | "dailyFocusDate">>;

/** Optimistically applies a settings change to /api/me (app-shell re-applies appearance), then persists it. */
export function useSaveSettings() {
  return useCallback(async (patch: SettingsPatch) => {
    await mutate<Me>("/api/me", (me) => (me ? { ...me, settings: { ...me.settings, ...patch } } : me), { revalidate: false });
    try {
      await api.patch("/api/settings", patch);
      return true;
    } catch (err) {
      toastError(err);
      return false;
    } finally {
      refresh("/api/me", "/api/settings", "/api/dashboard");
    }
  }, []);
}

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6" aria-labelledby={`${id}-title`}>
      <div className="mb-3">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>}
      </div>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

/** One settings row: label + help on the left, control on the right (stacks on mobile). */
export function Row({ label, hint, children, className, stack }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; stack?: boolean }) {
  return (
    <div className={cn("flex gap-3 px-4 py-3.5 md:px-5", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-fg-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
