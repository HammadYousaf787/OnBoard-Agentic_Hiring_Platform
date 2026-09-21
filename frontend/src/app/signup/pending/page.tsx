import Link from "next/link";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function SignupPendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Request submitted</h1>
        <p className="mt-2 text-sm text-muted">
          Your account request has been sent to the platform administrators. You&apos;ll be
          able to log in as soon as it&apos;s approved.
        </p>
        <Link href="/login">
          <Button className="mt-6 w-full">Back to login</Button>
        </Link>
      </div>
    </div>
  );
}
