"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { JobFormModal } from "../JobFormModal";
import { ApplyLinkCard } from "@/components/shared/ApplyLinkCard";
import { JobApplicantsBoard } from "@/components/shared/JobApplicantsBoard";
import { useRouter } from "next/navigation";

export function JobDetailClient({ jobId }: { jobId: string }) {
  const { jobs, users, applicants, assignHr, removeJob } = useAppData();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const job = jobs.find((j) => j.id === jobId);

  const jobApplicants = useMemo(
    () => applicants.filter((a) => a.jobId === jobId),
    [applicants, jobId]
  );

  const activeHrs = users.filter((u) => u.role === "hr" && u.status === "approved");
  const assignedHr = users.find((u) => u.id === job?.assignedHrId);

  if (!job) {
    return (
      <div>
        <Link href="/admin/jobs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to jobs
        </Link>
        <Card>
          <CardBody>
            <EmptyState icon={Briefcase} title="Job not found" description="It may have been deleted." />
          </CardBody>
        </Card>
      </div>
    );
  }

  async function handleAssignHr(hrId: string | undefined) {
    setAssignError(null);
    const result = await assignHr(job!.id, hrId);
    if (!result.success) {
      setAssignError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div>
      <Link href="/admin/jobs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to jobs
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
          <Card>
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

          <Card>
            <CardHeader title="Assigned HR" subtitle="Who owns recruitment for this role" />
            <CardBody>
              <Select
                value={job.assignedHrId ?? ""}
                onChange={(e) => handleAssignHr(e.target.value || undefined)}
              >
                <option value="">Unassigned</option>
                {activeHrs.map((hr) => (
                  <option key={hr.id} value={hr.id}>
                    {hr.name}
                  </option>
                ))}
              </Select>
              {assignError && <p className="mt-2 text-xs text-danger">{assignError}</p>}
              {assignedHr && (
                <Link
                  href={`/admin/hr/${assignedHr.id}`}
                  className="mt-3 block text-xs font-medium text-primary hover:underline"
                >
                  View {assignedHr.name}&apos;s profile →
                </Link>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <JobApplicantsBoard
          job={job}
          applicants={jobApplicants}
          detailBasePath={`/admin/jobs/${job.id}/applicants`}
          canManage={false}
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
          router.push("/admin/jobs");
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
