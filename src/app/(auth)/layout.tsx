import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/overview");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Daybook</span>
        </div>
        {children}
      </div>
    </main>
  );
}
