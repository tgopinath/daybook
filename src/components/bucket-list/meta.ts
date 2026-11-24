// Bucket list categories (shared by the API, the UI, search, demo data).
import { Briefcase, Compass, GraduationCap, Heart, Mountain, Plane, Sparkles, type LucideIcon } from "lucide-react";

export const BUCKET_CATEGORIES = ["Travel", "Adventure", "Career", "Family", "Learning", "Lifestyle", "Personal"] as const;
export type BucketCategory = (typeof BUCKET_CATEGORIES)[number];

export const BUCKET_META: Record<BucketCategory, { icon: LucideIcon; color: string }> = {
  Travel: { icon: Plane, color: "#3B9BE9" },
  Adventure: { icon: Mountain, color: "#20A779" },
  Career: { icon: Briefcase, color: "#635BFF" },
  Family: { icon: Heart, color: "#E45D5D" },
  Learning: { icon: GraduationCap, color: "#E9A23B" },
  Lifestyle: { icon: Sparkles, color: "#D9468F" },
  Personal: { icon: Compass, color: "#8B5CF6" },
};

export const bucketMeta = (c: string) => BUCKET_META[(BUCKET_CATEGORIES as readonly string[]).includes(c) ? (c as BucketCategory) : "Personal"];
