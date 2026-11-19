import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { isDemoEmail } from "@/lib/demo-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The demo banner shows for sample accounts started from "Explore demo".
  return <AppShell demo={isDemoEmail(user.email)}>{children}</AppShell>;
}
