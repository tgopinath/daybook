"use client";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** A My Security card: icon, title, status badge, description, then content. */
export function SecurityCard({
  icon: Icon,
  title,
  status,
  description,
  children,
  className,
  id,
}: {
  icon: LucideIcon;
  title: string;
  status?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, "-")}-title`;
  return (
    <Card className={cn("flex flex-col p-5", className)}>
      <section aria-labelledby={headingId} id={id} className="flex flex-1 flex-col scroll-mt-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={headingId} className="text-[15px] font-semibold">
                {title}
              </h2>
              {status}
            </div>
            {description && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-2">{description}</p>}
          </div>
        </div>
        {children && <div className="mt-4 flex-1">{children}</div>}
      </section>
    </Card>
  );
}
