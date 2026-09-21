"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AdminDashboardPage() {
  const { currentUser, users, jobs, applicants } = useAppData();

  const activeHrs = users.filter((u) => u.role === "hr" && u.status === "approved");
  const pendingAccounts = users.filter((u) => u.status === "pending");
  const openJobs = jobs.filter((j) => j.status === "open");

  const stats = [
    {
      label: "Active HR accounts",
      value: activeHrs.length,
      icon: Users,
      tone: "indigo" as const,
      href: "/admin/hr",
    },
    {
      label: "Open job positions",
      value: `${openJobs.length} / ${jobs.length}`,
      icon: Briefcase,
      tone: "blue" as const,
      href: "/admin/jobs",
    },
    {
      label: "Total applicants",
      value: applicants.length,
      icon: FileText,
      tone: "green" as const,
      href: "/admin/jobs",
    },
    {
      label: "Pending approvals",
      value: pendingAccounts.length,
      icon: ShieldCheck,
      tone: "amber" as const,
      href: "/admin/approvals",
    },
  ];

  const recentEvents = users
    .flatMap((u) =>
      u.approvalHistory.map((event) => ({ ...event, userName: u.name, userRole: u.role }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  const actionLabel: Record<string, string> = {
    approved: "approved",
    rejected: "rejected",
    removed: "removed",
    reinstated: "reinstated",
  };
  const actionTone: Record<string, "green" | "red" | "gray" | "amber"> = {
    approved: "green",
    rejected: "red",
    removed: "gray",
    reinstated: "amber",
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${currentUser?.name.split(" ")[0]}`}
        subtitle="Here's what's happening across your recruitment platform."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="h-full p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    stat.tone === "indigo"
                      ? "bg-primary-soft text-primary"
                      : stat.tone === "blue"
                      ? "bg-blue-50 text-blue-600"
                      : stat.tone === "green"
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning"
                  }`}
                >
                  <stat.icon className="h-5 w-5" />
                </span>
                <ArrowRight className="h-4 w-4 text-gray-300" />
              </div>
              <p className="mt-4 text-2xl font-semibold text-foreground">{stat.value}</p>
              <p className="mt-0.5 text-sm text-muted">{stat.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent account activity"
            subtitle="Approvals, rejections and HR changes"
            action={
              <Link
                href="/admin/approvals"
                className="text-xs font-medium text-primary hover:underline"
              >
                View approvals
              </Link>
            }
          />
          <CardBody className="p-0">
            {recentEvents.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No activity yet"
                description="Approval and account actions will show up here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recentEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {event.userName}{" "}
                        <span className="font-normal text-muted">
                          ({event.userRole === "admin" ? "Admin" : "HR"})
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        {actionLabel[event.action]} by {event.byUserName} ·{" "}
                        {new Date(event.date).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge tone={actionTone[event.action]}>{actionLabel[event.action]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Open positions overview" subtitle="Seats and assignment status" />
          <CardBody className="p-0">
            {jobs.length === 0 ? (
              <EmptyState icon={Briefcase} title="No jobs yet" />
            ) : (
              <ul className="divide-y divide-border">
                {jobs.slice(0, 5).map((job) => {
                  const hr = users.find((u) => u.id === job.assignedHrId);
                  return (
                    <li key={job.id} className="px-5 py-3.5">
                      <Link
                        href={`/admin/jobs/${job.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary"
                      >
                        {job.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {job.seats} seat{job.seats !== 1 ? "s" : ""} ·{" "}
                        {hr ? hr.name : "Unassigned"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
