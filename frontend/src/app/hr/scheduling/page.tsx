"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ClipboardCheck } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleInterviewModal } from "@/components/hr/ScheduleInterviewModal";
import { DemoTag } from "@/components/ui/DemoTag";
import { Applicant } from "@/lib/types";

export default function SchedulingPage() {
  const { currentUser, jobs, applicants } = useAppData();
  const [target, setTarget] = useState<Applicant | null>(null);

  const myJobIds = jobs.filter((j) => j.assignedHrId === currentUser?.id).map((j) => j.id);

  const pending = useMemo(
    () =>
      applicants
        .filter((a) => myJobIds.includes(a.jobId) && a.stage === "assessment_passed")
        .sort((a, b) => new Date(a.appliedDate).getTime() - new Date(b.appliedDate).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicants, currentUser]
  );

  function jobFor(jobId: string) {
    return jobs.find((j) => j.id === jobId);
  }

  return (
    <div>
      <PageHeader
        title="Pending Interview Scheduling"
        subtitle={
          <span>
            <DemoTag /> Candidates who passed initial assessment and are waiting for an
            interview slot
          </span>
        }
      />

      <Card>
        <CardBody className="p-0">
          {pending.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="All caught up"
              description="No candidates are currently waiting to be scheduled."
            />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((applicant) => {
                const job = jobFor(applicant.jobId);
                return (
                  <li
                    key={applicant.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  >
                    <div>
                      <Link
                        href={`/hr/jobs/${applicant.jobId}/applicants/${applicant.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary"
                      >
                        {applicant.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {job?.title} · Applied{" "}
                        {new Date(applicant.appliedDate).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setTarget(applicant)}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      Schedule interview
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {target && (
        <ScheduleInterviewModal
          open={!!target}
          onClose={() => setTarget(null)}
          applicantId={target.id}
          jobId={target.jobId}
          applicantName={target.name}
          jobTitle={jobFor(target.jobId)?.title ?? ""}
        />
      )}
    </div>
  );
}
