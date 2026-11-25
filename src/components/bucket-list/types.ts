import type { Media } from "@/lib/upload";

/** A bucket list item as returned by /api/bucket-list. */
export type BucketItemDTO = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  targetDate: string | null;
  completedAt: string | null;
  imageMediaId: string | null;
  image: Media | null;
  sortOrder: number;
  archivedAt: string | null;
  deletedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BucketListResponse = { items: BucketItemDTO[] };
