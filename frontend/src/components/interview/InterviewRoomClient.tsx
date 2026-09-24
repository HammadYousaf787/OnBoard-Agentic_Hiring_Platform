"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Captions,
  Check,
  Circle,
  Copy,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Play,
  Sparkles,
  Video,
  VideoOff,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import * as api from "@/lib/api";
import { Appointment, LiveInsight, TranscriptSegment } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/datetime";
import { Modal } from "@/components/ui/Modal";
import { Label, Textarea } from "@/components/ui/Field";
import { interviewsFor } from "@/lib/interviews";
import { useAgoraCall } from "./useAgoraCall";
import { useSpeechToText } from "./useSpeechToText";
import { useChunkedTranscription } from "./useChunkedTranscription";
import { useCallRecorder } from "./useCallRecorder";
import { RemoteView } from "./RemoteView";
import { ApplicationPanel, JobPanel, LiveAssistPanel, NotesPanel } from "./panels";
import { errorText, formatClock } from "./util";

const APPLY_PORTAL_URL = (
  process.env.NEXT_PUBLIC_APPLY_PORTAL_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

type Tab = "application" | "job" | "notes" | "live";
const TABS: { id: Tab; label: string }[] = [
  { id: "application", label: "Application" },
  { id: "job", label: "Job" },
  { id: "notes", label: "Notes & questions" },
  { id: "live", label: "Live AI" },
];

export function InterviewRoomClient({ appointmentId }: { appointmentId: string }) {
  const { currentUser, jobs, applicants, appointments, applyAppointmentUpdate, setupInterviewRooms } =
    useAppData();

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
  const [wantRecording, setWantRecording] = useState(false);
  const [wantAiAssist, setWantAiAssist] = useState(false);
  const [recPaused, setRecPaused] = useState(false);
  const [recStarted, setRecStarted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [busy, setBusy] = useState<"start" | "end" | "upload" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [review, setReview] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [insights, setInsights] = useState<LiveInsight[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const pendingBlob = useRef<Blob | null>(null);
  const lastSegmentId = useRef(0);
  const lastInsightId = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const call = useAgoraCall();
  const recorder = useCallRecorder({
    getRemoteVideo: () =>
      stageRef.current?.querySelector<HTMLVideoElement>('[data-testid="remote-video"] video') ?? null,
    getLocalVideo: () => localRef.current?.querySelector<HTMLVideoElement>("video") ?? null,
  });

  const updateAppt = useCallback(
    (a: Appointment) => {
      setAppt(a);
      applyAppointmentUpdate(a);
    },
    [applyAppointmentUpdate]
  );

  useEffect(() => {
    let cancelled = false;
    api
      .apiGetAppointment(appointmentId)
      .then((a) => {
        if (cancelled) return;
        // Finished interviews live in the interview record, not the room.
        if (a.roomStatus === "ended") {
          router.replace(`/hr/jobs/${a.jobId}/applicants/${a.applicantId}/interviews/${a.id}`);
          return;
        }
        setAppt(a);
        setWantRecording(a.recordingEnabled);
        setWantAiAssist(a.aiAssistEnabled);
        setReview(a.interviewerReview ?? "");
      })
      .catch((err) => !cancelled && setLoadError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [appointmentId, router]);

  const applicant = applicants.find((a) => a.id === appt?.applicantId);
  const job = jobs.find((j) => j.id === appt?.jobId);
  const live = appt?.roomStatus === "live";
  const ended = appt?.roomStatus === "ended";
  const inCall = call.joined;
  const candidateInterviews = interviewsFor(appointments, appt?.applicantId ?? "");
  const roundIndex = candidateInterviews.findIndex((a) => a.id === appointmentId);
  const applicantLink = appt?.roomToken ? `${APPLY_PORTAL_URL}/interview/${appt.roomToken}` : null;

  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  // Poll the merged transcript (both speakers) while live.
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const tick = async () => {
      try {
        const fresh = await api.apiListTranscriptSegments(appointmentId, lastSegmentId.current);
        if (stopped || fresh.length === 0) return;
        lastSegmentId.current = fresh[fresh.length - 1].id;
        setSegments((prev) =>
          [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))].sort(
            (a, b) => new Date(a.spokenAt).getTime() - new Date(b.spokenAt).getTime() || a.id - b.id
          )
        );
      } catch {
        // transient; next tick retries
      }
    };
    void tick();
    const t = window.setInterval(tick, 2000);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [live, appointmentId]);

  // Poll per-question AI insights while live (produced asynchronously by the backend).
  useEffect(() => {
    if (!live || !appt?.aiAssistEnabled) return;
    let stopped = false;
    const tick = async () => {
      try {
        const fresh = await api.apiListInsights(appointmentId, lastInsightId.current);
        if (stopped || fresh.length === 0) return;
        lastInsightId.current = fresh[fresh.length - 1].id;
        setInsights((prev) => [...prev, ...fresh]);
      } catch {
        // transient; next tick retries
      }
    };
    void tick();
    const t = window.setInterval(tick, 2500);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [live, appt?.aiAssistEnabled, appointmentId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [segments]);

  // Feed remote audio into the recorder as participants publish.
  useEffect(() => {
    if (!recStarted) return;
    call.remoteUsers.forEach((u) => recorder.addAudioTrack(u.audioTrack?.getMediaStreamTrack()));
  }, [call.remoteUsers, call.version, recStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  const postSegment = useCallback(
    (text: string) => {
      api.apiPostTranscriptSegment(appointmentId, text).catch(() => {});
    },
    [appointmentId]
  );
  const aiAssist = !!appt?.aiAssistEnabled;
  // Browser speech recognition is only the transcript source when AI assistance is off.
  const stt = useSpeechToText({
    active: inCall && live === true && call.micOn && captionsOn && !aiAssist,
    onFinal: postSegment,
  });
  // AI assistance on: once the candidate is in the room, send our own mic audio (in short
  // clips cut at pauses) to the backend for OpenAI transcription. The candidate's browser
  // does the same for theirs, so the backend hears both sides.
  const candidateHere = call.remoteUsers.length > 0;
  const aiStt = useChunkedTranscription({
    active: inCall && live === true && aiAssist && candidateHere && captionsOn,
    getTrack: call.getLocalAudioTrack,
    upload: (clip, ms) => api.apiUploadAudioClip(appointmentId, clip, ms),
  });

  async function copyLink() {
    if (!applicantLink) return;
    await navigator.clipboard.writeText(applicantLink).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function setupRoom() {
    setActionError(null);
    const result = await setupInterviewRooms([appointmentId]);
    if (!result.success) {
      setActionError(result.error ?? "Could not set up the room.");
      return;
    }
    setAppt(await api.apiGetAppointment(appointmentId));
  }

  async function joinCall(a: Appointment, withRecording: boolean) {
    const creds = await api.apiGetRoomToken(a.id);
    await call.join(creds);
    if (withRecording) {
      window.setTimeout(() => {
        recorder.start([call.getLocalAudioTrack()]);
        setRecStarted(true);
        setRecPaused(false);
      }, 800);
    }
  }

  async function startRoom() {
    if (!appt) return;
    setBusy("start");
    setActionError(null);
    try {
      const started = await api.apiStartRoom(appt.id, wantRecording, wantAiAssist);
      updateAppt(started);
      await joinCall(started, wantRecording);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function rejoin() {
    if (!appt) return;
    setBusy("start");
    setActionError(null);
    try {
      await joinCall(appt, false);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleRecording() {
    if (!appt) return;
    const next = !(appt.recordingEnabled && !recPaused);
    try {
      updateAppt(await api.apiSetRecordingEnabled(appt.id, next));
      if (next) {
        if (!recorder.isActive()) {
          recorder.start([call.getLocalAudioTrack()]);
          setRecStarted(true);
        } else {
          recorder.resume();
        }
        setRecPaused(false);
      } else {
        recorder.pause();
        setRecPaused(true);
      }
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  async function stopAiAssist() {
    if (!appt) return;
    try {
      updateAppt(await api.apiSetAiAssistEnabled(appt.id, false));
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  async function finishCall(skipRecording = false) {
    if (!appt) return;
    setActionError(null);
    setBusy("end");
    try {
      if (recorder.isActive() && !pendingBlob.current) {
        pendingBlob.current = await recorder.stop();
        setRecStarted(false);
      }
      await call.leave();

      if (pendingBlob.current && !skipRecording) {
        setBusy("upload");
        try {
          updateAppt(await api.apiUploadRecording(appt.id, pendingBlob.current));
          pendingBlob.current = null;
          setUploadFailed(false);
        } catch (err) {
          setActionError(`Recording upload failed: ${errorText(err)}`);
          setUploadFailed(true);
          setBusy(null);
          return;
        }
      }
      pendingBlob.current = null;
      setUploadFailed(false);
      updateAppt(await api.apiEndRoom(appt.id, review));
      router.push("/hr/appointments");
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const remote = call.remoteUsers.find((u) => u.videoTrack) ?? call.remoteUsers[0];
  const elapsed = live && appt?.roomStartedAt ? (now - new Date(appt.roomStartedAt).getTime()) / 1000 : 0;
  const recordingNow = !!appt?.recordingEnabled && !recPaused && recStarted;
  const pendingUpload = uploadFailed && busy === null && !ended && !inCall;

  const transcriptLines = useMemo(() => segments, [segments]);

  if (loadError) {
    return (
      <Card className="p-8">
        <EmptyState icon={Video} title="Interview not found" description={loadError} />
      </Card>
    );
  }
  if (!appt || !currentUser) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/hr/appointments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to appointments
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Interview{roundIndex >= 0 && candidateInterviews.length > 1 ? ` ${roundIndex + 1} of ${candidateInterviews.length}` : ""} · {applicant?.name ?? "Candidate"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {job?.title} · {formatDateTime(appt.dateTime)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {live && <span className="font-mono text-sm text-muted">{formatClock(elapsed)}</span>}
          <Badge tone={live ? "green" : ended ? "gray" : "amber"} dot>
            {live ? "Live" : ended ? "Ended" : "Not started"}
          </Badge>
          {recordingNow && (
            <Badge tone="red" dot>
              Recording
            </Badge>
          )}
          {live && aiAssist && (
            <Badge tone="blue" dot>
              AI assist
            </Badge>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
          <span>{actionError}</span>
          {pendingUpload && (
            <>
              <Button size="sm" variant="secondary" onClick={() => finishCall(false)}>
                Retry upload
              </Button>
              <Button size="sm" variant="ghost" onClick={() => finishCall(true)}>
                End without recording
              </Button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---- Video column ------------------------------------------------ */}
        <div className="space-y-4">
          {!live && !ended && (
            <Card className="p-8">
              <div className="mx-auto max-w-md text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Video className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Ready when you are</h2>
                <p className="mt-1 text-sm text-muted">
                  Prepare with the panels on the right, then open the room. The candidate can join
                  with their link only once you&apos;ve started it.
                </p>

                {applicantLink ? (
                  <div className="mt-5 rounded-lg border border-border bg-gray-50 p-3 text-left">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Candidate link
                    </p>
                    <p className="mt-1 break-all text-xs text-foreground">{applicantLink}</p>
                    <Button size="sm" variant="secondary" className="mt-2" onClick={copyLink}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" className="mt-5" onClick={setupRoom}>
                    Set up room &amp; get candidate link
                  </Button>
                )}

                <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={wantRecording}
                    onChange={(e) => setWantRecording(e.target.checked)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  Record video (saved after the call; the candidate is told)
                </label>
                <label className="mt-3 flex cursor-pointer items-start justify-center gap-2 text-left text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={wantAiAssist}
                    onChange={(e) => setWantAiAssist(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    Live AI assistance — both voices are transcribed by OpenAI and each answered
                    question is evaluated for you. The candidate is told, and this can&apos;t be
                    turned on after the call starts.
                  </span>
                </label>

                <Button className="mt-5" onClick={startRoom} loading={busy === "start"}>
                  <Play className="h-4 w-4" />
                  Start room
                </Button>
              </div>
            </Card>
          )}

          {live && (
            <>
              <div
                ref={stageRef}
                className="relative aspect-video overflow-hidden rounded-xl bg-slate-900"
              >
                {remote ? (
                  <RemoteView user={remote} version={call.version} className="h-full w-full" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-300">
                    {inCall ? "Waiting for the candidate to join…" : "You are not in the call."}
                  </div>
                )}
                <div
                  ref={(el) => {
                    localRef.current = el;
                    call.attachLocal(el);
                  }}
                  data-testid="local-video"
                  className="absolute bottom-3 right-3 h-28 w-44 overflow-hidden rounded-lg border-2 border-white/60 bg-black shadow-lg"
                />
                {call.sharing && (
                  <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white">
                    You are sharing your screen
                  </span>
                )}
              </div>

              {call.error && (
                <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{call.error}</p>
              )}

              {inCall ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant={call.micOn ? "secondary" : "danger"} onClick={call.toggleMic} aria-label="Toggle microphone">
                    {call.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </Button>
                  <Button variant={call.camOn ? "secondary" : "danger"} onClick={call.toggleCam} aria-label="Toggle camera">
                    {call.camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant={call.sharing ? "primary" : "secondary"}
                    onClick={call.sharing ? call.stopScreenShare : call.startScreenShare}
                    aria-label="Share screen"
                  >
                    <MonitorUp className="h-4 w-4" />
                    {call.sharing ? "Stop sharing" : "Share screen"}
                  </Button>
                  <Button
                    variant={recordingNow ? "danger" : "secondary"}
                    onClick={toggleRecording}
                    aria-label="Toggle recording"
                  >
                    <Circle className={`h-4 w-4 ${recordingNow ? "fill-current" : ""}`} />
                    {recordingNow ? "Stop recording" : "Record video"}
                  </Button>
                  {aiAssist && (
                    <Button variant="secondary" onClick={stopAiAssist} aria-label="Turn AI assistance off">
                      <Bot className="h-4 w-4" />
                      Stop AI assist
                    </Button>
                  )}
                  <Button
                    variant={captionsOn ? "primary" : "secondary"}
                    onClick={() => setCaptionsOn((v) => !v)}
                    aria-label="Toggle transcription"
                  >
                    <Captions className="h-4 w-4" />
                    Transcribe
                  </Button>
                  <Button variant="danger" onClick={() => setEndOpen(true)} loading={busy === "end" || busy === "upload"}>
                    <PhoneOff className="h-4 w-4" />
                    {busy === "upload" ? "Saving recording…" : "End interview"}
                  </Button>
                </div>
              ) : (
                <div className="flex justify-center gap-2">
                  <Button onClick={rejoin} loading={busy === "start"}>
                    <Video className="h-4 w-4" /> Rejoin call
                  </Button>
                  <Button variant="danger" onClick={() => setEndOpen(true)} loading={busy === "end"}>
                    <PhoneOff className="h-4 w-4" /> End interview
                  </Button>
                </div>
              )}

              {inCall && (
                <p
                  data-testid="stt-status"
                  className={`text-center text-xs ${(aiAssist ? aiStt.error : stt.error) ? "text-danger" : "text-muted"}`}
                >
                  {aiAssist
                    ? aiStt.error
                      ? aiStt.error
                      : !captionsOn
                        ? "Transcription is off."
                        : !call.micOn
                          ? "Transcription is paused while your microphone is muted."
                          : !candidateHere
                            ? "AI assistance is on — transcription starts when the candidate joins."
                            : aiStt.listening
                              ? "AI assistance is on — your speech and the candidate's are being transcribed."
                              : "Starting transcription…"
                    : !stt.supported
                    ? "Live transcription needs a browser with speech recognition (Chrome or Edge)."
                    : stt.error
                      ? stt.error
                      : !captionsOn
                        ? "Transcription is off."
                        : !call.micOn
                          ? "Transcription is paused while your microphone is muted."
                          : stt.listening
                            ? "Transcribing your speech…"
                            : "Starting transcription…"}
                </p>
              )}
            </>
          )}

          {ended && (
            <Card className="p-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted">Interview saved. Taking you back to appointments…</p>
            </Card>
          )}

          {live && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-sm font-semibold text-foreground">Live transcript</p>
                <span className="text-xs text-muted">Saved to storage when the interview ends</span>
              </div>
              <div className="h-48 space-y-2 overflow-y-auto px-4 py-3" data-testid="live-transcript">
                {transcriptLines.length === 0 && !stt.interim && (
                  <p className="text-sm text-muted">Nothing said yet.</p>
                )}
                {transcriptLines.map((s) => (
                  <p key={s.id} className="text-sm">
                    <span
                      className={`font-medium ${
                        s.speakerRole === "interviewer" ? "text-primary" : "text-emerald-700"
                      }`}
                    >
                      {s.speakerName}:
                    </span>{" "}
                    <span className="text-foreground">{s.text}</span>
                  </p>
                ))}
                {stt.interim && (
                  <p className="text-sm italic text-muted">
                    {currentUser.name}: {stt.interim}…
                  </p>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </Card>
          )}
        </div>

        {/* ---- Side panels ---------------------------------------------- */}
        <Card className="flex flex-col overflow-hidden xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)]">
          <div className="flex border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-2 py-3 text-xs font-medium transition-colors cursor-pointer ${
                  tab === t.id
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t.id === "live" && <Sparkles className="mr-1 inline h-3 w-3" />}
                {t.label}
                {t.id === "live" && insights.length > 0 && ` (${insights.length})`}
              </button>
            ))}
          </div>
          <div className="min-h-[24rem] flex-1 overflow-y-auto p-5">
            {tab === "application" &&
              (applicant ? <ApplicationPanel applicant={applicant} /> : <Missing what="application" />)}
            {tab === "job" && (job ? <JobPanel job={job} /> : <Missing what="job" />)}
            {tab === "notes" && <NotesPanel appointment={appt} onAppointmentChange={updateAppt} />}
            {tab === "live" && (
              <LiveAssistPanel
                appointmentId={appt.id}
                live={!!live}
                aiAssistEnabled={aiAssist}
                insights={insights}
              />
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="End interview"
        subtitle={applicant?.name}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="interview-review">What did you think of {applicant?.name ?? "the candidate"}?</Label>
            <Textarea
              id="interview-review"
              rows={7}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Strengths, concerns, and whether you'd move them forward…"
            />
          </div>
          <p className="text-xs text-muted">
            Saved with this interview alongside your pre-meeting notes, the transcript and the
            recording. You can edit it later from the interview record.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEndOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setEndOpen(false);
                void finishCall(false);
              }}
            >
              <PhoneOff className="h-4 w-4" />
              End interview
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return <p className="text-sm text-muted">The {what} isn&apos;t available.</p>;
}
