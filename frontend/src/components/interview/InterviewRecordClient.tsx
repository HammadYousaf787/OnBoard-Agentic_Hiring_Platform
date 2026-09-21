"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Video } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import * as api from "@/lib/api";
import { Appointment } from "@/lib/types";
import { interviewsFor } from "@/lib/interviews";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutosaveTextarea } from "@/components/ui/AutosaveTextarea";
import { formatDateTime } from "@/lib/datetime";
import { RemoveInterviewDialog } from "@/components/hr/RemoveInterviewDialog";
import { Button } from "@/components/ui/Button";
import { errorText, formatClock } from "./util";

type TranscriptLine = { speaker: string; role: string; text: string; offsetSeconds: number | null };

function formatBytes(n?: number) {
  if (!n) return "—";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/**
 * The saved record of one interview: pre-meeting notes, the AI questions that
 * were prepared, the interviewer's post-interview review, the recording and the
 * transcript (both stored in object storage). HR can edit notes and review; admins
 * see it read-only.
 */
export function InterviewRecordClient({
  jobId,
  applicantId,
  appointmentId,
  role,
}: {
  jobId: string;
  applicantId: string;
  appointmentId: string;
  role: "hr" | "admin";
}) {
  const { applicants, jobs, appointments, applyAppointmentUpdate } = useAppData();
  const editable = role === "hr";
  const base = role === "hr" ? "/hr" : "/admin";
  const profileHref = `${base}/jobs/${jobId}/applicants/${applicantId}`;

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[] | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const router = useRouter();

  const applicant = applicants.find((a) => a.id === applicantId);
  const job = jobs.find((j) => j.id === jobId);
  const rounds = useMemo(() => interviewsFor(appointments, applicantId), [appointments, applicantId]);
  const roundNumber = rounds.findIndex((a) => a.id === appointmentId) + 1;

  useEffect(() => {
    let cancelled = false;
    api
      .apiGetAppointment(appointmentId)
      .then((a) => !cancelled && setAppt(a))
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  const hasTranscript = appt?.hasTranscript;
  const hasRecording = appt?.hasRecording;
  useEffect(() => {
    if (hasTranscript) api.apiGetFinalTranscript(appointmentId).then(setTranscript).catch(() => {});
    if (hasRecording) api.apiGetRecordingUrl(appointmentId).then(setRecordingUrl).catch(() => {});
  }, [hasTranscript, hasRecording, appointmentId]);

  if (error) {
    return (
      <Card className="p-8">
        <EmptyState icon={Video} title="Interview not found" description={error} />
      </Card>
    );
  }
  if (!appt) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const ended = appt.roomStatus === "ended";
  const durationSeconds =
    appt.roomStartedAt && appt.roomEndedAt
      ? (new Date(appt.roomEndedAt).getTime() - new Date(appt.roomStartedAt).getTime()) / 1000
      : null;

  function update(a: Appointment) {
    setAppt(a);
    applyAppointmentUpdate(a);
  }

  return (
    <div>
      <Link
        href={profileHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {applicant?.name ?? "candidate"}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Interview {roundNumber > 0 ? roundNumber : ""}
            {rounds.length > 1 ? ` of ${rounds.length}` : ""} · {applicant?.name ?? "Candidate"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {job?.title} · {formatDateTime(appt.dateTime)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={ended ? "gray" : appt.roomStatus === "live" ? "green" : "blue"} dot>
            {ended ? "Completed" : appt.roomStatus === "live" ? "Live now" : "Upcoming"}
          </Badge>
          {editable && !ended && appt.roomStatus !== "live" && (
            <Button variant="secondary" onClick={() => setRemoveOpen(true)}>
              Remove slot
            </Button>
          )}
          {editable && !ended && (
            <Link
              href={`/hr/appointments/${appt.id}/room`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Video className="h-4 w-4" />
              {appt.roomStatus === "live" ? "Rejoin room" : "Open interviewer room"}
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Recording" subtitle="Stored in object storage" />
            <CardBody>
              {appt.hasRecording ? (
                recordingUrl ? (
                  <video
                    src={recordingUrl}
                    controls
                    preload="metadata"
                    data-testid="recording-player"
                    className="w-full rounded-lg bg-black"
                  />
                ) : (
                  <p className="text-sm text-muted">Loading recording…</p>
                )
              ) : (
                <p className="text-sm text-muted">
                  {ended ? "This interview wasn't recorded." : "Available after the interview ends, if recorded."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Transcript${appt.transcriptSegmentCount ? ` (${appt.transcriptSegmentCount} lines)` : ""}`}
              subtitle="Stored in object storage"
            />
            <CardBody>
              {appt.hasTranscript ? (
                transcript ? (
                  <div className="max-h-[32rem] space-y-2 overflow-y-auto" data-testid="transcript">
                    {transcript.map((s, i) => (
                      <p key={i} className="text-sm">
                        <span className="mr-2 font-mono text-xs text-muted">
                          {s.offsetSeconds !== null ? formatClock(s.offsetSeconds) : ""}
                        </span>
                        <span
                          className={`font-medium ${s.role === "interviewer" ? "text-primary" : "text-emerald-700"}`}
                        >
                          {s.speaker}:
                        </span>{" "}
                        {s.text}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Loading transcript…</p>
                )
              ) : (
                <p className="text-sm text-muted">
                  {ended ? "No speech was transcribed." : "Available after the interview ends."}
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Interviewer's review"
              subtitle={
                appt.interviewerReviewedAt
                  ? `Written ${formatDateTime(appt.interviewerReviewedAt)}`
                  : "What the interviewer thought of the candidate"
              }
            />
            <CardBody>
              {editable ? (
                <AutosaveTextarea
                  label="Review"
                  rows={6}
                  initial={appt.interviewerReview ?? ""}
                  placeholder="Strengths, concerns, and whether you'd move them forward…"
                  onSave={async (text) => update(await api.apiSaveInterviewReview(appt.id, text))}
                />
              ) : (
                <p className="whitespace-pre-line text-sm text-foreground">
                  {appt.interviewerReview || <span className="text-muted">No review written.</span>}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pre-meeting notes" subtitle="Notes made before and during the interview" />
            <CardBody>
              {editable ? (
                <AutosaveTextarea
                  label="Notes"
                  rows={6}
                  initial={appt.interviewerNotes ?? ""}
                  placeholder="Notes for this interview…"
                  onSave={async (text) => update(await api.apiSaveInterviewNotes(appt.id, text))}
                />
              ) : (
                <p className="whitespace-pre-line text-sm text-foreground">
                  {appt.interviewerNotes || <span className="text-muted">No notes.</span>}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="AI interview questions"
              subtitle={appt.aiQuestionsPrompt ? `Prioritised: ${appt.aiQuestionsPrompt}` : "As prepared for this interview"}
            />
            <CardBody>
              {appt.aiQuestions ? (
                <ol className="list-decimal space-y-2.5 pl-5 text-sm text-foreground">
                  {appt.aiQuestions.questions.map((q, i) => (
                    <li key={i}>
                      {q.question}
                      <span className="block text-xs text-muted">
                        {q.topic} · {q.source.replace("_", " ")}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No AI questions were generated.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-1.5 text-sm">
              <Detail label="Scheduled" value={formatDateTime(appt.dateTime)} />
              <Detail label="Started" value={appt.roomStartedAt ? formatDateTime(appt.roomStartedAt) : "—"} />
              <Detail label="Ended" value={appt.roomEndedAt ? formatDateTime(appt.roomEndedAt) : "—"} />
              <Detail label="Duration" value={durationSeconds !== null ? formatClock(durationSeconds) : "—"} />
              <Detail label="Recording size" value={appt.hasRecording ? formatBytes(appt.recordingSizeBytes) : "—"} />
            </CardBody>
          </Card>
        </div>
      </div>
      <RemoveInterviewDialog
        appointment={removeOpen ? appt : null}
        candidateName={applicant?.name ?? "the candidate"}
        onClose={() => setRemoveOpen(false)}
        onRemoved={() => router.push(profileHref)}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
