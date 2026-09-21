"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { AdminShell } from "@/components/layout/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { ready, currentUser } = useAppData();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) {
      router.replace("/login");
    } else if (currentUser.role !== "admin") {
      router.replace("/hr");
    }
  }, [ready, currentUser, router]);

  if (!ready || !currentUser || currentUser.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
