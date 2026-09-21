"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { DemoTag } from "@/components/ui/DemoTag";

export default function LoginPage() {
  const { ready, currentUser, login } = useAppData();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && currentUser) {
      router.replace(currentUser.role === "admin" ? "/admin" : "/hr");
    }
  }, [ready, currentUser, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    // Redirect handled by the effect above once currentUser updates.
    setSubmitting(false);
  }

  function fillDemo(role: "admin" | "hr") {
    if (role === "admin") {
      setEmail("admin@demo.com");
      setPassword("Admin@123");
    } else {
      setEmail("hr@demo.com");
      setPassword("Hr@123");
    }
    setError(null);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-white">
            O
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            Onboard<span className="text-primary">HQ</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Sign in to your recruitment console</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup label="Email address" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Password" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FieldGroup>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" loading={submitting}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Request access
            </Link>
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-border bg-white/60 p-4">
          <p className="mb-2.5 text-xs font-medium text-muted">
            <DemoTag /> Try the platform instantly with a sample account
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fillDemo("admin")}
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-primary-soft cursor-pointer"
            >
              <span className="block font-medium text-foreground">Admin demo</span>
              <span className="text-muted">admin@demo.com / Admin@123</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemo("hr")}
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-primary-soft cursor-pointer"
            >
              <span className="block font-medium text-foreground">HR demo</span>
              <span className="text-muted">hr@demo.com / Hr@123</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
