import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { isDemo } from "@/lib/demo-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Demo mode: a session from another server instance is unknown here, so start a fresh sample account.
  if (!user) redirect(isDemo() ? "/api/demo/start" : "/login");
  return <AppShell demo={isDemo()}>{children}</AppShell>;
}
