import { Suspense } from "react";
import { TimelineView } from "@/components/timeline/timeline-view";
import { Skeleton } from "@/components/ui/misc";

export const metadata = { title: "Life Timeline" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-[14px]" />}>
      <TimelineView />
    </Suspense>
  );
}
