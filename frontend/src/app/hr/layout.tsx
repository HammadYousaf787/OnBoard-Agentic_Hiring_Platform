"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { HrShell } from "@/components/layout/HrShell";

export default function HrLayout({ children }: { children: ReactNode }) {
  const { ready, currentUser } = useAppData();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) {
      router.replace("/login");
    } else if (currentUser.role !== "hr") {
      router.replace("/admin");
    }
  }, [ready, currentUser, router]);

  if (!ready || !currentUser || currentUser.role !== "hr") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <HrShell>{children}</HrShell>;
}
