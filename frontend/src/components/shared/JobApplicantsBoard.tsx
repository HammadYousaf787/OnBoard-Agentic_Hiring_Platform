"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  Code2,
  FileText,
  Sparkles,
  UserX,
  Users,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import type { BulkAction } from "@/lib/api";
import { Applicant, Job } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StarRating } from "@/components/ui/StarRating";
import { StageBadge } from "@/components/ui/StageBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { ScheduleInterviewModal } from "@/components/hr/ScheduleInterviewModal";
import { CvViewer } from "./CvViewer";

const rankValue = (a: Applicant) => a.manualRank ?? Number.MAX_SAFE_INTEGER;
const aiValue = (a: Applicant) => a.aiReviewDetails?.overall.score ?? a.aiScores?.overall ?? -1;

function compareApplicants(a: Applicant, b: Applicant) {
  if (rankValue(a) !== rankValue(b)) return rankValue(a) - rankValue(b);
  if (aiValue(a) !== aiValue(b)) return aiValue(b) - aiValue(a);
  return new Date(a.appliedDate).getTime() - new Date(b.appliedDate).getTime();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function JobApplicantsBoard({
  job,
  applicants,
  detailBasePath,
  canManage,
}: {
  job: Job;
  applicants: Applicant[];
  detailBasePath: string;
  /** Assigned HR: can reorder, select and move applicants. Admins get AI only. */
  canManage: boolean;
}) {
  const {
    runAiJobReview,
    runAiReviewForAll,
    setApplicantOrder,
    bulkApplicantAction,
    getApplicantCvUrl,
  } = useAppData();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [cvApplicant, setCvApplicant] = useState<Applicant | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Applicant | null>(null);
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const applicantList = useMemo(
    () => applicants.filter((a) => a.stage === "applied").sort(compareApplicants),
    [applicants]
  );
  const codingList = useMemo(
    () => applicants.filter((a) => a.stage === "coding_assessment").sort(compareApplicants),
    [applicants]
  );
  const interviewList = useMemo(
    () =>
      applicants
        .filter(
          (a) =>
            a.stage === "assessment_passed" ||
            a.stage === "interview_scheduled" ||
            a.stage === "accepted"
        )
        .sort(compareApplicants),
    [applicants]
  );
  const rejectedList = useMemo(
    () => applicants.filter((a) => a.stage === "rejected").sort(compareApplicants),
    [applicants]
  );

  const aiPosition = useMemo(() => {
    const scored = applicantList
      .filter((a) => aiValue(a) >= 0)
      .sort((a, b) => aiValue(b) - aiValue(a));
    return new Map(scored.map((a, i) => [a.id, i + 1]));
  }, [applicantList]);

  const selectedIds = applicantList.filter((a) => selected.has(a.id)).map((a) => a.id);
  const selectedCodingIds = codingList.filter((a) => selected.has(a.id)).map((a) => a.id);
  const technical = job.collectGithub;
  const allSelected = applicantList.length > 0 && selectedIds.length === applicantList.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= applicantList.length) return;
    const ids = applicantList.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    setMessage(null);
    const result = await setApplicantOrder(job.id, ids);
    setBusy(false);
    if (!result.success) setMessage({ tone: "error", text: result.error ?? "Could not save order." });
  }

  async function reviewOne(id: string) {
    setReviewingId(id);
    setMessage(null);
    const result = await runAiJobReview(id);
    setReviewingId(null);
    if (!result.success) setMessage({ tone: "error", text: result.error ?? "AI review failed." });
  }

  async function reviewAll() {
    setMessage(null);
    setProgress({ done: 0, total: applicantList.length });
    const result = await runAiReviewForAll(
      applicantList.map((a) => a.id),
      (done, total) => setProgress({ done, total })
    );
    setProgress(null);
    setMessage(
      result.failed > 0
        ? {
            tone: "error",
            text: `${result.succeeded} reviewed, ${result.failed} failed${
              result.firstError ? `: ${result.firstError}` : ""
            }`,
          }
        : { tone: "info", text: `AI reviewed ${result.succeeded} applicant${result.succeeded !== 1 ? "s" : ""}.` }
    );
  }

  async function moveSelected(action: BulkAction, ids: string[]) {
    setBusy(true);
    setMessage(null);
    const result = await bulkApplicantAction(job.id, ids, action);
    setBusy(false);
    if (!result.success) {
      if (action === "reject") setRejectError(result.error ?? "Something went wrong.");
      else setMessage({ tone: "error", text: result.error ?? "Something went wrong." });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setRejectIds(null);
    setRejectError(null);
  }

  const reviewingAll = progress !== null;

  return (
    <div className="space-y-3">
      {message && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            message.tone === "error" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"
          }`}
        >
          {message.text}
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-4 ${
          technical
            ? "lg:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
        }`}
      >
        <Card className="overflow-hidden">
          <CardHeader
            title={`Applicants (${applicantList.length})`}
            subtitle="AI scores are a recommendation only — order is set by HR"
            action={
              applicantList.length > 0 && (
                <Button
                  size="sm"
                  onClick={reviewAll}
                  loading={reviewingAll}
                  disabled={busy || reviewingId !== null}
                >
                  <Sparkles className="h-4 w-4" />
                  {reviewingAll ? `Reviewing ${progress.done}/${progress.total}` : "Run AI on all"}
                </Button>
              )
            }
          />
          {canManage && applicantList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-gray-50 px-5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  aria-label="Select all applicants"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(applicantList.map((a) => a.id)))
                  }
                  className="h-4 w-4 cursor-pointer accent-indigo-600"
                />
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select all"}
              </label>
              {selectedIds.length > 0 && (
                <div className="ml-auto flex flex-wrap gap-2">
                  {technical && (
                    <Button
                      size="sm"
                      onClick={() => moveSelected("coding_assessment", selectedIds)}
                      disabled={busy}
                    >
                      <Code2 className="h-4 w-4" />
                      Forward coding assessment
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={technical ? "secondary" : "primary"}
                    onClick={() => moveSelected("pass_to_interview", selectedIds)}
                    disabled={busy}
                  >
                    <CalendarClock className="h-4 w-4" />
                    {technical ? "Pass to interview without coding assessment" : "Pass to interview"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setRejectIds(selectedIds)}
                    disabled={busy}
                  >
                    <UserX className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
          {applicantList.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No applicants"
              description="New applications to this position appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {applicantList.map((applicant, index) => {
                const ai = aiPosition.get(applicant.id);
                const score = aiValue(applicant);
                return (
                  <li key={applicant.id} className="flex items-center gap-3 px-4 py-3">
                    {canManage && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${applicant.name}`}
                        checked={selected.has(applicant.id)}
                        onChange={() => toggle(applicant.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
                      />
                    )}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-foreground">
                      {index + 1}
                    </span>
                    <Link
                      href={`${detailBasePath}/${applicant.id}`}
                      className="min-w-0 flex-1 hover:text-primary"
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {applicant.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {applicant.experienceYears} yrs · Applied {formatDate(applicant.appliedDate)}
                      </p>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {score >= 0 ? (
                        <>
                          <StarRating value={score} size="sm" />
                          <Badge tone="indigo" className="text-[10px]">
                            AI suggests #{ai}
                          </Badge>
                        </>
                      ) : (
                        <span className="text-xs text-muted">Not reviewed</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`View CV of ${applicant.name}`}
                      title="View CV"
                      onClick={() => setCvApplicant(applicant)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Run AI review for ${applicant.name}`}
                      title="Run AI review"
                      onClick={() => reviewOne(applicant.id)}
                      loading={reviewingId === applicant.id}
                      disabled={reviewingAll || busy || (reviewingId !== null && reviewingId !== applicant.id)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    {canManage && (
                      <div className="flex shrink-0 flex-col">
                        <button
                          aria-label={`Move ${applicant.name} up`}
                          onClick={() => move(index, -1)}
                          disabled={busy || index === 0}
                          className="rounded p-0.5 text-muted hover:bg-gray-100 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Move ${applicant.name} down`}
                          onClick={() => move(index, 1)}
                          disabled={busy || index === applicantList.length - 1}
                          className="rounded p-0.5 text-muted hover:bg-gray-100 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {technical && (
          <SidePanel
            title={`Coding Assessment (${codingList.length})`}
            empty="Applicants forwarded to the coding assessment appear here."
            applicants={codingList}
            detailBasePath={detailBasePath}
            onViewCv={setCvApplicant}
            selection={
              canManage
                ? {
                    selected,
                    onToggle: toggle,
                    busy,
                    selectedIds: selectedCodingIds,
                    onPass: () => moveSelected("pass_to_interview", selectedCodingIds),
                    onReject: () => setRejectIds(selectedCodingIds),
                  }
                : undefined
            }
          />
        )}
        <SidePanel
          title={`Interview Pending (${interviewList.length})`}
          empty="Applicants passed to interview appear here."
          applicants={interviewList}
          detailBasePath={detailBasePath}
          onViewCv={setCvApplicant}
          onSchedule={canManage ? setScheduleTarget : undefined}
        />
        <SidePanel
          title={`Rejected (${rejectedList.length})`}
          empty="Rejected applicants appear here."
          applicants={rejectedList}
          detailBasePath={detailBasePath}
          onViewCv={setCvApplicant}
        />
      </div>

      <ConfirmDialog
        open={rejectIds !== null}
        onClose={() => {
          setRejectIds(null);
          setRejectError(null);
        }}
        onConfirm={() => rejectIds && moveSelected("reject", rejectIds)}
        title="Reject selected applicants"
        description={`${rejectIds?.length ?? 0} applicant${rejectIds?.length !== 1 ? "s" : ""} will be moved to Rejected.`}
        confirmLabel="Reject"
        danger
        loading={busy}
        error={rejectError}
      />

      {scheduleTarget && (
        <ScheduleInterviewModal
          open
          onClose={() => setScheduleTarget(null)}
          applicantId={scheduleTarget.id}
          jobId={job.id}
          applicantName={scheduleTarget.name}
          jobTitle={job.title}
        />
      )}

      <Modal
        open={cvApplicant !== null}
        onClose={() => setCvApplicant(null)}
        title={cvApplicant?.cvFileName || "CV"}
        subtitle={cvApplicant?.name}
        width="lg"
      >
        {cvApplicant && (
          <CvViewer
            key={cvApplicant.id}
            fileName={cvApplicant.cvFileName}
            summary={cvApplicant.cvSummary}
            loadUrl={(inline) => getApplicantCvUrl(cvApplicant.id, inline)}
          />
        )}
      </Modal>
    </div>
  );
}

function SidePanel({
  title,
  empty,
  applicants,
  detailBasePath,
  onViewCv,
  onSchedule,
  selection,
}: {
  title: string;
  empty: string;
  applicants: Applicant[];
  detailBasePath: string;
  onViewCv: (applicant: Applicant) => void;
  onSchedule?: (applicant: Applicant) => void;
  selection?: {
    selected: Set<string>;
    onToggle: (id: string) => void;
    busy: boolean;
    selectedIds: string[];
    onPass: () => void;
    onReject: () => void;
  };
}) {
  return (
    <Card className="self-start overflow-hidden">
      <CardHeader title={title} />
      {selection && selection.selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-gray-50 px-4 py-2.5">
          <span className="text-xs text-muted">{selection.selectedIds.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={selection.onPass} disabled={selection.busy}>
              <CalendarClock className="h-4 w-4" />
              Pass to interview
            </Button>
            <Button size="sm" variant="danger" onClick={selection.onReject} disabled={selection.busy}>
              <UserX className="h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      )}
      {applicants.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {applicants.map((applicant) => (
            <li key={applicant.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              {selection && (
                <input
                  type="checkbox"
                  aria-label={`Select ${applicant.name}`}
                  checked={selection.selected.has(applicant.id)}
                  onChange={() => selection.onToggle(applicant.id)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
                />
              )}
              <Link
                href={`${detailBasePath}/${applicant.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{applicant.name}</p>
                  <p className="truncate text-xs text-muted">
                    {applicant.experienceYears} yrs · Applied {formatDate(applicant.appliedDate)}
                  </p>
                </div>
                {applicant.stage !== "assessment_passed" &&
                  applicant.stage !== "rejected" &&
                  applicant.stage !== "coding_assessment" && <StageBadge stage={applicant.stage} />}
              </Link>
              {onSchedule && applicant.stage === "assessment_passed" && (
                <button
                  aria-label={`Schedule interview for ${applicant.name}`}
                  title="Schedule interview"
                  onClick={() => onSchedule(applicant)}
                  className="shrink-0 rounded p-1 text-muted hover:bg-gray-100 hover:text-primary cursor-pointer"
                >
                  <CalendarPlus className="h-4 w-4" />
                </button>
              )}
              <button
                aria-label={`View CV of ${applicant.name}`}
                title="View CV"
                onClick={() => onViewCv(applicant)}
                className="shrink-0 rounded p-1 text-muted hover:bg-gray-100 hover:text-primary cursor-pointer"
              >
                <FileText className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
