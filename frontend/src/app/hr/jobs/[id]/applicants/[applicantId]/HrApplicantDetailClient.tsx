"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Calendar,
  CalendarClock,
  Check,
  Clock,
  Code2,
  FileText,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import type { Appointment } from "@/lib/types";
import { PageHeader } from "@/components/layout/AdminShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/StageBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DemoTag } from "@/components/ui/DemoTag";
import { ScheduleInterviewModal } from "@/components/hr/ScheduleInterviewModal";
import { RemoveInterviewDialog } from "@/components/hr/RemoveInterviewDialog";
import { RescheduleModal } from "@/components/hr/RescheduleModal";
import { RejectApplicantModal } from "@/components/hr/RejectApplicantModal";
import { AiJobReviewCard } from "@/components/shared/AiJobReviewCard";
import { CvViewer } from "@/components/shared/CvViewer";
import { interviewsFor } from "@/lib/interviews";
import { InterviewsMenu } from "@/components/shared/InterviewsMenu";
import { HrAssessmentCard } from "@/components/shared/HrAssessmentCard";
import { formatDateTime } from "@/lib/datetime";

export function HrApplicantDetailClient({
  jobId,
  applicantId,
}: {
  jobId: string;
  applicantId: string;
}) {
  const {
    currentUser,
    jobs,
    applicants,
    appointments,
    passToInterview,
    forwardCodingAssessment,
    acceptApplicant,
    saveApplicantToCvBank,
    getApplicantCvUrl,
    runAiJobReview,
  } = useAppData();

  const [cvOpen, setCvOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Appointment | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [stageLoading, setStageLoading] = useState<"interview" | "coding" | null>(null);
  const [saveCvBankLoading, setSaveCvBankLoading] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);

  const job = jobs.find((j) => j.id === jobId && j.assignedHrId === currentUser?.id);
  const applicant = applicants.find((a) => a.id === applicantId && a.jobId === jobId);

  const jobApplicants = useMemo(
    () => applicants.filter((a) => a.jobId === jobId),
    [applicants, jobId]
  );

  const interviews = useMemo(() => interviewsFor(appointments, applicantId), [appointments, applicantId]);
  // The interview that can still be rescheduled: the latest one that hasn't ended.
  const appointment = useMemo(
    () => [...interviews].reverse().find((a) => a.roomStatus !== "ended"),
    [interviews]
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
          href={`/hr/jobs/${jobId}`}
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

  async function handleStageMove(kind: "interview" | "coding") {
    setStageLoading(kind);
    setPipelineError(null);
    const result =
      kind === "interview"
        ? await passToInterview(applicant!.id)
        : await forwardCodingAssessment(applicant!.id);
    setStageLoading(null);
    if (!result.success) setPipelineError(result.error ?? "Something went wrong.");
  }

  async function handleSaveToCvBank() {
    setSaveCvBankLoading(true);
    setPipelineError(null);
    const result = await saveApplicantToCvBank(applicant!.id);
    setSaveCvBankLoading(false);
    if (!result.success) setPipelineError(result.error ?? "Something went wrong.");
  }

  async function handleAccept() {
    setAcceptLoading(true);
    setAcceptError(null);
    const result = await acceptApplicant(applicant!.id);
    setAcceptLoading(false);
    if (!result.success) {
      setAcceptError(result.error ?? "Something went wrong.");
      return;
    }
    setAcceptOpen(false);
  }

  async function handleRunAiReview() {
    setAiReviewLoading(true);
    setAiReviewError(null);
    const result = await runAiJobReview(applicant!.id);
    setAiReviewLoading(false);
    if (!result.success) setAiReviewError(result.error ?? "Something went wrong.");
  }

  return (
    <div>
      <Link
        href={`/hr/jobs/${jobId}`}
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
              recordBasePath={`/hr/jobs/${job.id}/applicants/${applicant.id}/interviews`}
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

        <div className="lg:col-span-2 space-y-6">
          <HrAssessmentCard applicant={applicant} editable />

          <AiJobReviewCard
            applicant={applicant}
            rank={rank}
            action={
              <div className="text-right">
                <Button onClick={handleRunAiReview} loading={aiReviewLoading} size="sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  {applicant.aiReviewDetails ? "Re-run AI Job Review" : "Run AI Job Review"}
                </Button>
                {aiReviewError && (
                  <p className="mt-2 max-w-xs text-xs text-danger">{aiReviewError}</p>
                )}
              </div>
            }
          />

          <Card>
            <CardHeader
              title="Recruitment pipeline"
              subtitle="Move this candidate forward or make a final decision"
            />
            <CardBody>
              {pipelineError && (
                <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {pipelineError}
                </p>
              )}
              {(applicant.stage === "applied" || applicant.stage === "coding_assessment") && (
                <div>
                  <p className="mb-4 text-sm text-muted">
                    {applicant.stage === "coding_assessment"
                      ? "This candidate has been forwarded the coding assessment."
                      : "This candidate is still awaiting an initial review."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.collectGithub && applicant.stage === "applied" && (
                      <Button
                        onClick={() => handleStageMove("coding")}
                        loading={stageLoading === "coding"}
                        disabled={stageLoading !== null}
                      >
                        <Code2 className="h-4 w-4" />
                        Forward coding assessment
                      </Button>
                    )}
                    <Button
                      variant={job.collectGithub && applicant.stage === "applied" ? "secondary" : "primary"}
                      onClick={() => handleStageMove("interview")}
                      loading={stageLoading === "interview"}
                      disabled={stageLoading !== null}
                    >
                      <Check className="h-4 w-4" />
                      {job.collectGithub && applicant.stage === "applied"
                        ? "Pass to interview without coding assessment"
                        : "Pass to interview"}
                    </Button>
                    <Button variant="danger" onClick={() => setRejectOpen(true)}>
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {applicant.stage === "assessment_passed" && (
                <div>
                  <p className="mb-4 text-sm text-muted">
                    This candidate is pending an interview and is ready to be scheduled.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setScheduleOpen(true)}>
                      <CalendarClock className="h-4 w-4" />
                      Schedule interview
                    </Button>
                    <Button variant="danger" onClick={() => setRejectOpen(true)}>
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {applicant.stage === "interview_scheduled" && (
                <div>
                  {appointment ? (
                    <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        Interview {interviews.indexOf(appointment) + 1} scheduled for{" "}
                        <span className="font-medium">{formatDateTime(appointment.dateTime)}</span>
                        {appointment.notifyDayBefore && " · reminder set for 1 day prior"}
                      </span>
                    </div>
                  ) : (
                    <div className="mb-4 flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-muted">
                      <Check className="h-4 w-4 shrink-0" />
                      <span>
                        {interviews.length} interview{interviews.length !== 1 ? "s" : ""} completed.
                        Schedule another round, or make a decision.
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setAcceptOpen(true)}>
                      <Check className="h-4 w-4" />
                      Accept candidate
                    </Button>
                    <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                      <CalendarClock className="h-4 w-4" />
                      Schedule another interview
                    </Button>
                    {appointment && (
                      <Button variant="secondary" onClick={() => setRescheduleOpen(true)}>
                        <CalendarClock className="h-4 w-4" />
                        Reschedule
                      </Button>
                    )}
                    {appointment && appointment.roomStatus !== "live" && (
                      <Button variant="secondary" onClick={() => setRemoveTarget(appointment)}>
                        <Trash2 className="h-4 w-4" />
                        Remove slot
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => setRejectOpen(true)}>
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {applicant.stage === "accepted" && (
                <div className="flex items-start gap-3 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This candidate has been accepted. One seat on {job.title} has been filled.
                  </span>
                </div>
              )}

              {applicant.stage === "rejected" && (
                <div>
                  <div className="flex items-start gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                    <X className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      This candidate was rejected.
                      {applicant.rejectionNote && (
                        <span className="block mt-1 italic">&ldquo;{applicant.rejectionNote}&rdquo;</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-4">
                    {applicant.savedToCvBank ? (
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <Archive className="h-3.5 w-3.5" />
                        Saved to the{" "}
                        <Link href="/hr/cv-bank" className="text-primary hover:underline">
                          CV bank
                        </Link>{" "}
                        for future opportunities.
                      </p>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleSaveToCvBank}
                        loading={saveCvBankLoading}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Save to CV bank
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
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

      <ScheduleInterviewModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        applicantId={applicant.id}
        jobId={job.id}
        applicantName={applicant.name}
        jobTitle={job.title}
      />

      <RemoveInterviewDialog
        appointment={removeTarget}
        candidateName={applicant.name}
        onClose={() => setRemoveTarget(null)}
      />

      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        appointment={appointment ?? null}
        subtitle={`${applicant.name} · ${job.title}`}
      />

      <RejectApplicantModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        applicantId={applicant.id}
        applicantName={applicant.name}
      />

      <ConfirmDialog
        open={acceptOpen}
        onClose={() => {
          setAcceptOpen(false);
          setAcceptError(null);
        }}
        onConfirm={handleAccept}
        title="Accept candidate"
        description={`${applicant.name} will be marked as hired and one seat on ${job.title} will be filled.`}
        confirmLabel="Accept candidate"
        loading={acceptLoading}
        error={acceptError}
      />
    </div>
  );
}
