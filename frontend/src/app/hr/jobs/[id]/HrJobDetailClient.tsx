"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Pencil,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { JobFormModal } from "@/app/admin/jobs/JobFormModal";
import { ApplyLinkCard } from "@/components/shared/ApplyLinkCard";
import { JobApplicantsBoard } from "@/components/shared/JobApplicantsBoard";

export function HrJobDetailClient({ jobId }: { jobId: string }) {
  const { currentUser, jobs, applicants, removeJob } = useAppData();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const job = jobs.find((j) => j.id === jobId && j.assignedHrId === currentUser?.id);

  const jobApplicants = useMemo(
    () => applicants.filter((a) => a.jobId === jobId),
    [applicants, jobId]
  );

  if (!job) {
    return (
      <div>
        <Link href="/hr/jobs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to my jobs
        </Link>
        <Card>
          <CardBody>
            <EmptyState
              icon={Briefcase}
              title="Job not found"
              description="It may have been deleted or is no longer assigned to you."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Link href="/hr/jobs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to my jobs
      </Link>

      <PageHeader
        title={job.title}
        subtitle={`${job.department} · ${job.location}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="contents">
          <Card className="lg:col-span-2">
            <CardHeader title="Position details" />
            <CardBody className="space-y-3">
              <Badge tone={job.status === "open" ? "green" : "gray"} dot>
                {job.status === "open" ? "Open" : "Closed"}
              </Badge>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPin className="h-4 w-4 text-gray-400" /> {job.location}
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Wallet className="h-4 w-4 text-gray-400" /> {job.currency}{" "}
                {job.salaryMin.toLocaleString()} – {job.salaryMax.toLocaleString()}
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Users className="h-4 w-4 text-gray-400" /> {job.filledSeats}/{job.seats} seat
                {job.seats !== 1 ? "s" : ""} filled
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Job description
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm text-muted">
                  {job.description}
                </p>
              </div>
            </CardBody>
          </Card>

          <ApplyLinkCard job={job} />
        </div>
      </div>

      <div className="mt-6">
        <JobApplicantsBoard
          job={job}
          applicants={jobApplicants}
          detailBasePath={`/hr/jobs/${job.id}/applicants`}
          canManage={true}
        />
      </div>

      <JobFormModal open={editOpen} onClose={() => setEditOpen(false)} job={job} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={async () => {
          setDeleteLoading(true);
          const result = await removeJob(job.id);
          setDeleteLoading(false);
          if (!result.success) {
            setDeleteError(result.error ?? "Something went wrong.");
            return;
          }
          router.push("/hr/jobs");
        }}
        title="Delete job posting"
        description={`This will permanently delete "${job.title}" and all of its applicants. This can't be undone.`}
        confirmLabel="Delete job"
        danger
        loading={deleteLoading}
        error={deleteError}
      />
    </div>
  );
}
