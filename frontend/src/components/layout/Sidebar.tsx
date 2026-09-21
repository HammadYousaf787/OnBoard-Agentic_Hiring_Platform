"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Briefcase,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { AiUsageMeter } from "@/components/admin/AiUsageMeter";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/hr", label: "HR Panel", icon: Users, exact: false },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase, exact: false },
  { href: "/admin/approvals", label: "Approvals", icon: ShieldCheck, exact: false },
];

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { users, logout } = useAppData();

  const pendingCount = users.filter((u) => u.status === "pending").length;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const content = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-semibold">
          O
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">
            Onboard<span className="text-primary">HQ</span>
          </p>
          <p className="text-[11px] text-muted leading-tight">Admin Console</p>
        </div>
        <button
          onClick={onCloseMobile}
          className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={clsx(
                "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-gray-600 hover:bg-gray-50 hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.href === "/admin/approvals" && pendingCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <AiUsageMeter />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-danger cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onCloseMobile}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
