"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { JobFormModal } from "./JobFormModal";
import { Job } from "@/lib/types";

function formatSalary(job: Job) {
  return `${job.currency} ${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()}`;
}

export default function JobsPage() {
  const { jobs, users, applicants, removeJob } = useAppData();
  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [jobs]
  );

  function applicantCount(jobId: string) {
    return applicants.filter((a) => a.jobId === jobId).length;
  }

  function hrName(hrId?: string) {
    return users.find((u) => u.id === hrId)?.name;
  }

  return (
    <div>
      <PageHeader
        title="Job Panel"
        subtitle="Create and manage open positions across the company."
        actions={
          <Button
            onClick={() => {
              setEditingJob(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Post a job
          </Button>
        }
      />

      {sortedJobs.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Briefcase}
              title="No jobs posted yet"
              description="Create your first job posting to start receiving applicants."
              action={
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Post a job
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sortedJobs.map((job) => (
            <Card key={job.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/admin/jobs/${job.id}`}
                    className="text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {job.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">{job.department}</p>
                </div>
                <Badge tone={job.status === "open" ? "green" : "gray"} dot>
                  {job.status === "open" ? "Open" : "Closed"}
                </Badge>
              </div>

              <p className="mt-3 line-clamp-2 text-sm text-muted">{job.description}</p>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {job.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> {formatSalary(job)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {job.filledSeats}/{job.seats} seats filled
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <div className="text-xs text-muted">
                  <span className="font-medium text-foreground">{applicantCount(job.id)}</span>{" "}
                  applicant{applicantCount(job.id) !== 1 ? "s" : ""} ·{" "}
                  {hrName(job.assignedHrId) ?? (
                    <span className="text-warning">Unassigned</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingJob(job);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setDeleteTarget(job)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <JobFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingJob(null);
        }}
        job={editingJob}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteLoading(true);
          const result = await removeJob(deleteTarget.id);
          setDeleteLoading(false);
          if (!result.success) {
            setDeleteError(result.error ?? "Something went wrong.");
            return;
          }
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        title="Delete job posting"
        description={`This will permanently delete "${deleteTarget?.title}" and all of its applicants. This can't be undone.`}
        confirmLabel="Delete job"
        danger
        loading={deleteLoading}
        error={deleteError}
      />
    </div>
  );
}
