"use client";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/misc";
import { AssistantView } from "./_components/assistant-view";

export default function AssistantPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <AssistantView />
    </Suspense>
  );
}
