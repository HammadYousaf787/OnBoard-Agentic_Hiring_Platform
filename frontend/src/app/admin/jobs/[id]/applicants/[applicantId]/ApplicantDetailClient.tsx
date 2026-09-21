"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Code2,
  FileText,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { DemoTag } from "@/components/ui/DemoTag";
import { StageBadge } from "@/components/ui/StageBadge";
import { AiJobReviewCard } from "@/components/shared/AiJobReviewCard";
import { CvViewer } from "@/components/shared/CvViewer";
import { interviewsFor } from "@/lib/interviews";
import { InterviewsMenu } from "@/components/shared/InterviewsMenu";
import { HrAssessmentCard } from "@/components/shared/HrAssessmentCard";

export function ApplicantDetailClient({
  jobId,
  applicantId,
}: {
  jobId: string;
  applicantId: string;
}) {
  const { jobs, applicants, appointments, getApplicantCvUrl, runAiJobReview } = useAppData();
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);
  const [cvOpen, setCvOpen] = useState(false);

  const job = jobs.find((j) => j.id === jobId);
  const applicant = applicants.find((a) => a.id === applicantId && a.jobId === jobId);

  const interviews = useMemo(() => interviewsFor(appointments, applicantId), [appointments, applicantId]);

  const jobApplicants = useMemo(
    () => applicants.filter((a) => a.jobId === jobId),
    [applicants, jobId]
  );

  const rank = useMemo(() => {
    if (!applicant?.aiScores) return null;
    const ranked = jobApplicants
      .filter((a) => a.aiScores)
      .sort((a, b) => b.aiScores!.overall - a.aiScores!.overall);
    const idx = ranked.findIndex((a) => a.id === applicant.id);
    return idx === -1 ? null : { position: idx + 1, total: ranked.length };
  }, [jobApplicants, applicant]);

  if (!job || !applicant) {
    return (
      <div>
        <Link
          href={`/admin/jobs/${jobId}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to job
        </Link>
        <Card>
          <CardBody>
            <EmptyState icon={FileText} title="Applicant not found" />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/admin/jobs/${jobId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {job.title}
      </Link>

      <PageHeader
        title={applicant.name}
        subtitle={`Applied for ${job.title}`}
        actions={
          <>
            <InterviewsMenu
              appointments={interviews}
              recordBasePath={`/admin/jobs/${job.id}/applicants/${applicant.id}/interviews`}
            />
            <StageBadge stage={applicant.stage} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Applicant information" />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Mail className="h-4 w-4 text-gray-400" /> {applicant.email}
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Phone className="h-4 w-4 text-gray-400" /> {applicant.phone}
              </div>
              {(applicant.city || applicant.country) && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {[applicant.city, applicant.country].filter(Boolean).join(", ")}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Calendar className="h-4 w-4 text-gray-400" /> Applied{" "}
                {new Date(applicant.appliedDate).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
              <div className="border-t border-border pt-3 text-sm text-foreground">
                <span className="font-medium">{applicant.experienceYears}</span> years of
                experience
              </div>

              {(applicant.linkedinUrl || applicant.githubUrl) && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {applicant.isDemo && <DemoTag />} {applicant.isDemo ? "Sample social" : "Social"}{" "}
                    links
                  </p>
                  {applicant.linkedinUrl && (
                    <a
                      href={applicant.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Globe className="h-4 w-4" /> LinkedIn profile
                    </a>
                  )}
                  {applicant.githubUrl && (
                    <a
                      href={applicant.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Code2 className="h-4 w-4" /> GitHub profile
                    </a>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="CV & application" />
            <CardBody className="space-y-3">
              <button
                onClick={() => setCvOpen(true)}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:border-primary hover:bg-primary-soft cursor-pointer"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <FileText className="h-4 w-4 text-gray-400" />
                  {applicant.cvFileName}
                </span>
                <span className="text-xs font-medium text-primary">View</span>
              </button>
              {applicant.coverLetter && (
                <div className="border-t border-border pt-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                    <MessageSquare className="h-3.5 w-3.5" /> Cover letter
                  </p>
                  <p className="text-sm text-muted">{applicant.coverLetter}</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <HrAssessmentCard applicant={applicant} editable={false} />

          <AiJobReviewCard
            applicant={applicant}
            rank={rank}
            action={
              <div className="text-right">
                <Button
                  size="sm"
                  loading={aiReviewLoading}
                  onClick={async () => {
                    setAiReviewLoading(true);
                    setAiReviewError(null);
                    const result = await runAiJobReview(applicant.id);
                    setAiReviewLoading(false);
                    if (!result.success) setAiReviewError(result.error ?? "Something went wrong.");
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {applicant.aiReviewDetails ? "Re-run AI Job Review" : "Run AI Job Review"}
                </Button>
                {aiReviewError && (
                  <p className="mt-2 max-w-xs text-xs text-danger">{aiReviewError}</p>
                )}
              </div>
            }
          />
        </div>
      </div>

      <Modal
        open={cvOpen}
        onClose={() => setCvOpen(false)}
        title={applicant.cvFileName || "CV"}
        subtitle={applicant.name}
        width="lg"
      >
        <CvViewer
          fileName={applicant.cvFileName}
          summary={applicant.cvSummary}
          loadUrl={(inline) => getApplicantCvUrl(applicant.id, inline)}
        />
      </Modal>
    </div>
  );
}
