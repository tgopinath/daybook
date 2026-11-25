import { Suspense } from "react";
import { FinanceView } from "@/components/finance/finance-view";
import { Skeleton } from "@/components/ui/misc";

export const metadata = { title: "My Finance" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-[14px]" />}>
      <FinanceView />
    </Suspense>
  );
}
