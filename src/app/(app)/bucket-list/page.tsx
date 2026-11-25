import { Suspense } from "react";
import { BucketListView } from "@/components/bucket-list/bucket-list-view";
import { Skeleton } from "@/components/ui/misc";

export const metadata = { title: "Bucket List" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-[14px]" />}>
      <BucketListView />
    </Suspense>
  );
}
