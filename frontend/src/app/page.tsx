"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";

export default function Home() {
  const { ready, currentUser } = useAppData();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) {
      router.replace("/login");
    } else if (currentUser.role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/hr");
    }
  }, [ready, currentUser, router]);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
