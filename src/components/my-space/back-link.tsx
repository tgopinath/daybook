"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { mySpacePageAt } from "@/components/layout/nav";

/** "← My space" above every page that lives inside My space (rendered once, in the app shell). */
export function MySpaceBackLink() {
  const pathname = usePathname();
  const page = mySpacePageAt(pathname);
  if (!page) return null;
  return (
    <nav aria-label="Breadcrumb" className="-mt-2 mb-2">
      <Link
        href="/my-space"
        className="-ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        My space
        <span className="sr-only">, back from {page.label}</span>
      </Link>
    </nav>
  );
}
