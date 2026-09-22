"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Archive,
  Briefcase,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

const navItems = [
  { href: "/hr", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/hr/jobs", label: "My Jobs", icon: Briefcase, exact: false },
  { href: "/hr/appointments", label: "Appointments", icon: CalendarClock, exact: false },
  { href: "/hr/scheduling", label: "Pending Scheduling", icon: CalendarClock, exact: false },
  { href: "/hr/cv-bank", label: "CV Bank", icon: Archive, exact: false },
  { href: "/hr/settings", label: "Settings", icon: Settings, exact: false },
];

export function HrSidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, applicants, jobs, logout } = useAppData();

  const myJobIds = jobs
    .filter((j) => j.assignedHrId === currentUser?.id)
    .map((j) => j.id);
  const pendingSchedulingCount = applicants.filter(
    (a) => myJobIds.includes(a.jobId) && a.stage === "assessment_passed"
  ).length;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const renderContent = (compact: boolean) => (
    <div className="flex h-full flex-col bg-white">
      <div
        className={clsx(
          "flex items-center gap-2.5 border-b border-border py-5",
          compact ? "justify-center px-2" : "px-5"
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-semibold">
          O
        </div>
        {!compact && (
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">
              Onboard<span className="text-primary">HQ</span>
            </p>
            <p className="text-[11px] text-muted leading-tight">HR Console</p>
          </div>
        )}
        <button
          onClick={onCloseMobile}
          className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className={clsx("flex-1 space-y-1 overflow-y-auto py-4", compact ? "px-2" : "px-3")}>
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
              title={compact ? item.label : undefined}
              aria-label={item.label}
              className={clsx(
                "relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                compact ? "justify-center px-0" : "justify-between px-3",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-gray-600 hover:bg-gray-50 hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {!compact && item.label}
              </span>
              {item.href === "/hr/scheduling" && pendingSchedulingCount > 0 && (
                <span
                  className={clsx(
                    "flex items-center justify-center rounded-full bg-danger px-1 font-semibold text-white",
                    compact ? "absolute right-1 top-0.5 h-4 min-w-4 text-[10px]" : "h-5 min-w-5 text-[11px]"
                  )}
                >
                  {pendingSchedulingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={clsx("border-t border-border", compact ? "p-2" : "p-3")}>
        <button
          onClick={handleLogout}
          title={compact ? "Log out" : undefined}
          aria-label="Log out"
          className={clsx(
            "flex w-full items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-danger cursor-pointer",
            compact ? "justify-center px-0" : "px-3"
          )}
        >
          <LogOut className="h-4 w-4" />
          {!compact && "Log out"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={clsx(
          "relative hidden shrink-0 border-r border-border transition-[width] duration-200 lg:sticky lg:top-0 lg:block lg:h-screen lg:self-start",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-64"
        )}
      >
        {renderContent(collapsed)}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white text-gray-500 shadow-sm transition-colors hover:text-primary cursor-pointer"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border shadow-xl">
            {renderContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
