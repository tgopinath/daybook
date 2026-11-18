"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { api } from "@/lib/client";
import { browserTz } from "@/lib/time";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [withDemo, setWithDemo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") await api.post("/api/auth/signup", { ...form, timezone: browserTz(), withDemo });
      else await api.post("/api/auth/login", { email: form.email, password: form.password });
      const next = params.get("next");
      // Full navigation: starts the app with a clean client cache for this user.
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Card className="p-7">
      <h1 className="text-xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-fg-2">{mode === "login" ? "Sign in to your dashboard." : "One place for tasks, goals, reminders and more."}</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {mode === "signup" && (
          <Field label="Name">
            <Input autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
        )}
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus={mode === "login"} />
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
          <Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : 1} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {mode === "signup" && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-fg-2">
            <Checkbox checked={withDemo} onChange={setWithDemo} size={16} className="mt-0.5 rounded-[5px]" label="Add sample data" />
            <span>Start with sample data so you can explore. It&apos;s labelled <em>Demo</em> and can be removed anytime.</span>
          </label>
        )}
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={loading} className="mt-1 w-full justify-center">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-fg-2">
        {mode === "login" ? (
          <>New here? <Link href="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></>
        )}
      </p>
    </Card>
  );
}
