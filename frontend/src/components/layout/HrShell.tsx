"use client";

import { ReactNode, useState } from "react";
import { Menu } from "lucide-react";
import { HrSidebar } from "./HrSidebar";
import { AssistantPanel } from "@/components/shared/AssistantPanel";
import { useAppData } from "@/context/AppDataContext";

export function HrShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentUser } = useAppData();

  return (
    <div className="flex min-h-screen">
      <HrSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight text-foreground">
                {currentUser?.name}
              </p>
              <p className="text-xs leading-tight text-muted">{currentUser?.title ?? "HR"}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              {currentUser?.name
                ?.split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <AssistantPanel />
    </div>
  );
}
