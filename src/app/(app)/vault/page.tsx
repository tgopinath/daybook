"use client";
import { Suspense } from "react";
import { VaultView } from "@/components/vault/vault-view";
import { Skeleton } from "@/components/ui/misc";

export default function VaultPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <VaultView />
    </Suspense>
  );
}
