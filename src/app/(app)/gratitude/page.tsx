import { Suspense } from "react";
import { GratitudeView } from "@/components/gratitude/gratitude-view";
import { Skeleton } from "@/components/ui/misc";

export const metadata = { title: "Gratitude" };

export default function GratitudePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <GratitudeView />
    </Suspense>
  );
}
