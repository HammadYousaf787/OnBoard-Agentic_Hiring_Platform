"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  Captions,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import {
  fetchInterviewState,
  InterviewState,
  joinInterview,
  postSegment,
  StateResult,
  uploadAudioClip,
} from "@/lib/interview";
import { useAgoraCall } from "@/components/interview/useAgoraCall";
import { useSpeechToText } from "@/components/interview/useSpeechToText";
import { useChunkedTranscription } from "@/components/interview/useChunkedTranscription";
import { RemoteView } from "@/components/interview/RemoteView";

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon}
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

/** Shown before the candidate joins and again during the call, like the recording notice. */
function AiNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      data-testid="ai-notice"
      className={`flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 text-left text-blue-900 ${
        compact ? "px-3 py-1.5 text-xs" : "px-3.5 py-3 text-sm"
      }`}
    >
      <Bot className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium">AI interview assistance is on.</span> Your voice will be
        transcribed and analysed by an AI service (OpenAI) to help the interviewer ask follow-up
        questions. AI does not make hiring decisions.
      </span>
    </div>
  );
}

const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";
const btnPlain = "border border-border bg-white text-foreground hover:bg-gray-50";

export function InterviewClient({ token }: { token: string }) {
  const [result, setResult] = useState<StateResult | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const call = useAgoraCall();
  const { joined, leave } = call;

  const state: InterviewState | null = result?.status === "ok" ? result.state : null;
  const live = state?.room_status === "live";
  const ended = state?.room_status === "ended";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await fetchInterviewState(token);
      if (!cancelled) setResult(r);
    };
    void load();
    const t = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [token]);

  // The interviewer ended the interview: drop out of the call.
  useEffect(() => {
    if (ended && joined) void leave();
  }, [ended, joined, leave]);

  const onFinal = useCallback((text: string) => void postSegment(token, text), [token]);
  const aiAssist = !!state?.ai_assist_enabled;
  // Browser speech recognition is only used when AI assistance is off; with it on, our
  // own microphone is sent to the backend in short clips for OpenAI transcription.
  const stt = useSpeechToText({ active: joined && !!live && call.micOn && !aiAssist, onFinal });
  const aiStt = useChunkedTranscription({
    active: joined && !!live && aiAssist,
    getTrack: call.getLocalAudioTrack,
    upload: (clip, ms) => uploadAudioClip(token, clip, ms),
  });

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      await call.join(await joinInterview(token));
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setJoining(false);
    }
  }

  if (!result) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (result.status === "not_found") {
    return (
      <div className="px-4 py-16">
        <Notice
          icon={<AlertCircle className="h-6 w-6" />}
          title="Interview link not found"
          body="This link is invalid or no longer active. Please check the link you were sent."
        />
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="px-4 py-16">
        <Notice icon={<AlertCircle className="h-6 w-6" />} title="Unable to load" body={result.message} />
      </div>
    );
  }

  const s = result.state;

  if (ended) {
    return (
      <div className="px-4 py-16">
        <Notice
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Interview finished"
          body={`Thanks for speaking with ${s.interviewer_name}. Our team will be in touch about next steps.`}
        />
      </div>
    );
  }

  const remote = call.remoteUsers.find((u) => u.videoTrack) ?? call.remoteUsers[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Video interview</p>
          <h1 className="text-xl font-semibold text-foreground">{s.job_title}</h1>
          <p className="text-sm text-muted">
            with {s.interviewer_name} ·{" "}
            {new Date(s.scheduled_at).toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {s.ai_assist_enabled && live && (
          <span
            data-testid="ai-banner"
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800"
          >
            <Bot className="h-3 w-3" /> AI assistance is on
          </span>
        )}
        {s.recording_enabled && live && (
          <span
            data-testid="recording-banner"
            className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger"
          >
            <Circle className="h-2.5 w-2.5 fill-current" /> This interview is being recorded
          </span>
        )}
      </div>

      {!live && (
        <Notice
          icon={<Clock className="h-6 w-6" />}
          title="Waiting for the interviewer"
          body={`${s.interviewer_name} hasn't opened the room yet. Keep this page open — it will let you join as soon as they start.`}
        />
      )}
      {!live && s.ai_assist_enabled && (
        <div className="mx-auto mt-4 max-w-md">
          <AiNotice />
        </div>
      )}

      {live && !joined && (
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Video className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">The interviewer is ready</h2>
          <p className="mt-2 text-sm text-muted">
            You&apos;ll be asked for camera and microphone access.{" "}
            {s.ai_assist_enabled
              ? "Your speech is transcribed and shared with the interviewer as interview notes"
              : "Your speech is transcribed in your browser and shared with the interviewer as interview notes"}
            {s.recording_enabled ? ", and the video is being recorded" : ""}.
          </p>
          {s.ai_assist_enabled && (
            <div className="mt-4">
              <AiNotice />
            </div>
          )}
          {joinError && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{joinError}</p>
          )}
          <button
            onClick={join}
            disabled={joining}
            className={`${btn} mt-5 w-full bg-primary text-white hover:bg-primary-dark`}
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Join interview
          </button>
        </div>
      )}

      {live && joined && (
        <div className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
            {remote ? (
              <RemoteView user={remote} version={call.version} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-300">
                Connecting to {s.interviewer_name}…
              </div>
            )}
            <div
              ref={call.attachLocal}
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

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={call.toggleMic}
              aria-label="Toggle microphone"
              className={`${btn} ${call.micOn ? btnPlain : "bg-danger text-white"}`}
            >
              {call.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              onClick={call.toggleCam}
              aria-label="Toggle camera"
              className={`${btn} ${call.camOn ? btnPlain : "bg-danger text-white"}`}
            >
              {call.camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </button>
            <button
              onClick={call.sharing ? call.stopScreenShare : call.startScreenShare}
              aria-label="Share screen"
              className={`${btn} ${call.sharing ? "bg-primary text-white" : btnPlain}`}
            >
              <MonitorUp className="h-4 w-4" />
              {call.sharing ? "Stop sharing" : "Share screen"}
            </button>
            <button onClick={() => void leave()} className={`${btn} bg-danger text-white hover:bg-red-700`}>
              <PhoneOff className="h-4 w-4" /> Leave
            </button>
          </div>

          <p
            data-testid="stt-status"
            className={`flex items-center justify-center gap-1.5 text-xs ${(aiAssist ? aiStt.error : stt.error) ? "text-danger" : "text-muted"}`}
          >
            <Captions className="h-3.5 w-3.5 shrink-0" />
            {aiAssist
              ? aiStt.error
                ? aiStt.error
                : !call.micOn
                  ? "Transcription is paused while your microphone is muted."
                  : aiStt.listening
                    ? "Your speech is being transcribed by AI for the interviewer's notes."
                    : "Starting transcription…"
              : !stt.supported
              ? "Live transcription isn't supported in this browser (use Chrome or Edge)."
              : stt.error
                ? stt.error
                : !call.micOn
                  ? "Transcription is paused while your microphone is muted."
                  : stt.interim
                    ? `Hearing: ${stt.interim}…`
                    : stt.listening
                      ? "Your speech is being transcribed for the interviewer's notes."
                      : "Starting transcription…"}
          </p>
        </div>
      )}
    </main>
  );
}
