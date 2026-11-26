import { redirect } from "next/navigation";

/** The Overview was merged into My space (the home page). Kept so old links, bookmarks and PWA shortcuts still work. */
export default function OverviewPage() {
  redirect("/my-space");
}
