"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserX,
  XCircle,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApprovalAction } from "@/lib/types";

const actionMeta: Record<
  ApprovalAction,
  { label: string; icon: typeof CheckCircle2; tone: "green" | "red" | "gray" | "amber" }
> = {
  approved: { label: "Approved", icon: CheckCircle2, tone: "green" },
  rejected: { label: "Rejected", icon: XCircle, tone: "red" },
  removed: { label: "Removed", icon: Trash2, tone: "gray" },
  reinstated: { label: "Reinstated", icon: RotateCcw, tone: "amber" },
};

export function HrDetailClient({ hrId }: { hrId: string }) {
  const { users, jobs, applicants, removeHr, reinstateHr } = useAppData();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reinstateOpen, setReinstateOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const hr = users.find((u) => u.id === hrId && u.role === "hr");

  const assignedJobs = useMemo(
    () => jobs.filter((j) => j.assignedHrId === hrId),
    [jobs, hrId]
  );

  const history = useMemo(
    () =>
      [...(hr?.approvalHistory ?? [])].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [hr]
  );

  if (!hr) {
    return (
      <div>
        <Link href="/admin/hr" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to HR panel
        </Link>
        <Card>
          <CardBody>
            <EmptyState icon={UserX} title="HR account not found" description="It may have been removed." />
          </CardBody>
        </Card>
      </div>
    );
  }

  function applicantCount(jobId: string) {
    return applicants.filter((a) => a.jobId === jobId).length;
  }

  return (
    <div>
      <Link href="/admin/hr" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to HR panel
      </Link>

      <PageHeader
        title={hr.name}
        subtitle={hr.title ?? "HR team member"}
        actions={
          hr.status === "approved" ? (
            <Button variant="danger" onClick={() => setRemoveOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Remove HR
            </Button>
          ) : (
            <Button onClick={() => setReinstateOpen(true)}>
              <RotateCcw className="h-4 w-4" />
              Reinstate HR
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Contact information" />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Mail className="h-4 w-4 text-gray-400" /> {hr.email}
              </div>
              {hr.phone && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Phone className="h-4 w-4 text-gray-400" /> {hr.phone}
                </div>
              )}
              {hr.department && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Briefcase className="h-4 w-4 text-gray-400" /> {hr.department}
                </div>
              )}
              {(hr.city || hr.country) && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {[hr.city, hr.country].filter(Boolean).join(", ")}
                </div>
              )}
              <div className="pt-2">
                {hr.status === "approved" ? (
                  <Badge tone="green" dot>Active</Badge>
                ) : (
                  <Badge tone="gray" dot>Removed</Badge>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Approval history" subtitle="When they were added and by whom" />
            <CardBody className="p-0">
              {history.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="No history recorded" />
              ) : (
                <ul className="divide-y divide-border">
                  {history.map((event) => {
                    const meta = actionMeta[event.action];
                    const Icon = meta.icon;
                    return (
                      <li key={event.id} className="flex gap-3 px-5 py-4">
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            meta.tone === "green"
                              ? "bg-success-soft text-success"
                              : meta.tone === "red"
                              ? "bg-danger-soft text-danger"
                              : meta.tone === "amber"
                              ? "bg-warning-soft text-warning"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {meta.label} by {event.byUserName}
                          </p>
                          <p className="text-xs text-muted">
                            {new Date(event.date).toLocaleString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {event.note && (
                            <p className="mt-1 text-xs text-muted italic">&ldquo;{event.note}&rdquo;</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Assigned job positions"
              subtitle={`Recruitment currently assigned to ${hr.name.split(" ")[0]}`}
            />
            <CardBody className="p-0">
              {assignedJobs.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No jobs assigned"
                  description="Assign this HR member to a job from the Jobs panel."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {assignedJobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-3 px-5 py-4">
                      <div>
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary"
                        >
                          {job.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {job.department} · {job.seats} seat{job.seats !== 1 ? "s" : ""} ·{" "}
                          {applicantCount(job.id)} applicant{applicantCount(job.id) !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Badge tone={job.status === "open" ? "green" : "gray"} dot>
                        {job.status === "open" ? "Open" : "Closed"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => {
          setRemoveOpen(false);
          setActionError(null);
        }}
        onConfirm={async () => {
          setActionLoading(true);
          const result = await removeHr(hr.id);
          setActionLoading(false);
          if (!result.success) {
            setActionError(result.error ?? "Something went wrong.");
            return;
          }
          setRemoveOpen(false);
          setActionError(null);
        }}
        title="Remove HR account"
        description={`${hr.name} will lose access to the platform and any jobs assigned to them will become unassigned.`}
        confirmLabel="Remove HR"
        danger
        loading={actionLoading}
        error={actionError}
      />

      <ConfirmDialog
        open={reinstateOpen}
        onClose={() => {
          setReinstateOpen(false);
          setActionError(null);
        }}
        onConfirm={async () => {
          setActionLoading(true);
          const result = await reinstateHr(hr.id);
          setActionLoading(false);
          if (!result.success) {
            setActionError(result.error ?? "Something went wrong.");
            return;
          }
          setReinstateOpen(false);
          setActionError(null);
        }}
        title="Reinstate HR account"
        description={`${hr.name} will regain access to the platform.`}
        confirmLabel="Reinstate"
        loading={actionLoading}
        error={actionError}
      />
    </div>
  );
}
