"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldCheck, UserPlus } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { Role } from "@/lib/types";

export default function SignupPage() {
  const { signup } = useAppData();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("hr");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const result = await signup({ name, email, password, role, title });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    router.push("/signup/pending");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-white">
            O
          </div>
          <h1 className="text-lg font-semibold text-foreground">Request platform access</h1>
          <p className="mt-1 text-sm text-muted">
            Your request will need to be approved by an administrator before you can sign in.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup label="I am requesting access as" htmlFor="role" required>
              <Select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="hr">HR — Recruitment access</option>
                <option value="admin">Admin — Platform administrator</option>
              </Select>
            </FieldGroup>

            <FieldGroup label="Full name" htmlFor="name" required>
              <Input
                id="name"
                required
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup label="Job title" htmlFor="title" hint="Optional, shown to admins reviewing your request">
              <Input
                id="title"
                placeholder={role === "admin" ? "Operations Admin" : "HR Executive"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup label="Email address" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Password" htmlFor="password" required>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FieldGroup>
              <FieldGroup label="Confirm password" htmlFor="confirmPassword" required>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </FieldGroup>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-xs text-primary">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Accounts are reviewed manually. You&apos;ll be able to log in only after an
                admin approves this request.
              </span>
            </div>

            <Button type="submit" className="w-full" loading={submitting}>
              <UserPlus className="h-4 w-4" />
              Submit request
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
