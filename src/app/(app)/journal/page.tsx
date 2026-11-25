import { Suspense } from "react";
import { JournalView } from "@/components/journal/journal-view";
import { Skeleton } from "@/components/ui/misc";

export const metadata = { title: "Journal" };

export default function JournalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <JournalView />
    </Suspense>
  );
}
