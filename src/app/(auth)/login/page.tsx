import { Suspense } from "react";
import { AuthForm } from "../auth-form";
import { isDemo } from "@/lib/demo-mode";
import { googleConfigured } from "@/lib/google";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="login" googleEnabled={googleConfigured() && !isDemo()} noDatabase={isDemo()} />
    </Suspense>
  );
}
