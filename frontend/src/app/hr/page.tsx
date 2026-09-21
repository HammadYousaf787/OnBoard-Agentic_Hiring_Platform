"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Users,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/datetime";
import { isUpcoming, useNow } from "@/lib/scheduling";

export default function HrDashboardPage() {
  const { currentUser, jobs, applicants, appointments } = useAppData();
  const now = useNow();

  const myJobs = jobs.filter((j) => j.assignedHrId === currentUser?.id);
  const myJobIds = myJobs.map((j) => j.id);
  const myApplicants = applicants.filter((a) => myJobIds.includes(a.jobId));
  const myAppointments = appointments.filter((appt) => appt.hrId === currentUser?.id);

  const openSeatsRemaining = myJobs.reduce(
    (sum, j) => sum + Math.max(0, j.seats - j.filledSeats),
    0
  );
  const pendingScheduling = myApplicants.filter((a) => a.stage === "assessment_passed");
  const upcoming = myAppointments
    .filter((appt) => isUpcoming(appt, now))
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const stats = [
    {
      label: "Assigned jobs",
      value: myJobs.length,
      icon: Briefcase,
      href: "/hr/jobs",
      tone: "indigo" as const,
    },
    {
      label: "Open seats remaining",
      value: openSeatsRemaining,
      icon: Users,
      href: "/hr/jobs",
      tone: "blue" as const,
    },
    {
      label: "Upcoming interviews",
      value: upcoming.length,
      icon: CalendarClock,
      href: "/hr/appointments",
      tone: "green" as const,
    },
    {
      label: "Awaiting scheduling",
      value: pendingScheduling.length,
      icon: ClipboardList,
      href: "/hr/scheduling",
      tone: "amber" as const,
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${currentUser?.name.split(" ")[0]}`}
        subtitle="Here's what's happening with your recruitment pipeline."
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Upcoming interviews"
            subtitle="Your next scheduled candidate meetings"
            action={
              <Link href="/hr/appointments" className="text-xs font-medium text-primary hover:underline">
                View calendar
              </Link>
            }
          />
          <CardBody className="p-0">
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No upcoming interviews" />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 5).map((appt) => {
                  const applicant = applicants.find((a) => a.id === appt.applicantId);
                  const job = jobs.find((j) => j.id === appt.jobId);
                  return (
                    <li key={appt.id} className="px-5 py-3.5">
                      <p className="text-sm font-medium text-foreground">
                        {applicant?.name ?? "Unknown candidate"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {job?.title} · {formatDateTime(appt.dateTime)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Awaiting interview scheduling"
            subtitle="Candidates who passed initial assessment"
            action={
              <Link href="/hr/scheduling" className="text-xs font-medium text-primary hover:underline">
                Schedule now
              </Link>
            }
          />
          <CardBody className="p-0">
            {pendingScheduling.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Nothing waiting on you" />
            ) : (
              <ul className="divide-y divide-border">
                {pendingScheduling.slice(0, 5).map((applicant) => {
                  const job = jobs.find((j) => j.id === applicant.jobId);
                  return (
                    <li key={applicant.id} className="px-5 py-3.5">
                      <p className="text-sm font-medium text-foreground">{applicant.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{job?.title}</p>
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
