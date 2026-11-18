"use client";
import { Suspense } from "react";
import { NotesView } from "@/components/notes/notes-view";
import { Skeleton } from "@/components/ui/misc";

export default function NotesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <NotesView />
    </Suspense>
  );
}
