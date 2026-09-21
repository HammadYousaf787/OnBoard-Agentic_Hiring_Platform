"use client";

import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import * as api from "@/lib/api";
import { Applicant, Appointment, Job, LiveAssist } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { StarRating } from "@/components/ui/StarRating";
import { CvViewer } from "@/components/shared/CvViewer";
import { errorText } from "./util";

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export function ApplicationPanel({ applicant }: { applicant: Applicant }) {
  const { getApplicantCvUrl } = useAppData();
  const [showCv, setShowCv] = useState(false);
  const review = applicant.aiReviewDetails;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-base font-semibold text-foreground">{applicant.name}</p>
        <div className="mt-2 space-y-1 text-xs text-muted">
          <p className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> {applicant.email}
          </p>
          <p className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> {applicant.phone}
          </p>
          {(applicant.city || applicant.country) && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {[applicant.city, applicant.country].filter(Boolean).join(", ")}
            </p>
          )}
          <p>{applicant.experienceYears} years of experience</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {applicant.githubUrl && (
            <a href={applicant.githubUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              GitHub
            </a>
          )}
          {applicant.linkedinUrl && (
            <a href={applicant.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              LinkedIn
            </a>
          )}
        </div>
      </div>

      {review && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">AI review</span>
            <StarRating value={review.overall.score} size="sm" />
          </div>
          <p className="mt-1.5 text-xs text-muted">{review.overall.reasoning}</p>
        </div>
      )}

      {applicant.coverLetter && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Cover letter</p>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">{applicant.coverLetter}</p>
        </div>
      )}

      <div>
        <Button size="sm" variant="secondary" onClick={() => setShowCv((v) => !v)}>
          <FileText className="h-3.5 w-3.5" />
          {showCv ? "Hide CV" : `Open CV${applicant.cvFileName ? ` (${applicant.cvFileName})` : ""}`}
        </Button>
        {showCv && (
          <div className="mt-3">
            <CvViewer
              fileName={applicant.cvFileName}
              summary={applicant.cvSummary}
              loadUrl={(inline) => getApplicantCvUrl(applicant.id, inline)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export function JobPanel({ job }: { job: Job }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-base font-semibold text-foreground">{job.title}</p>
      <div className="space-y-1.5 text-xs text-muted">
        <p className="flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" /> {job.department}
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> {job.location}
        </p>
        <p className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> {job.currency} {job.salaryMin.toLocaleString()} –{" "}
          {job.salaryMax.toLocaleString()}
        </p>
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Job description</p>
        <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{job.description}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes + AI questions
// ---------------------------------------------------------------------------

export function NotesPanel({
  appointment,
  onAppointmentChange,
}: {
  appointment: Appointment;
  onAppointmentChange: (a: Appointment) => void;
}) {
  const [notes, setNotes] = useState(appointment.interviewerNotes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [extra, setExtra] = useState(appointment.aiQuestionsPrompt ?? "");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const latestNotes = useRef(notes);
  useEffect(() => {
    latestNotes.current = notes;
  });

  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        const updated = await api.apiSaveInterviewNotes(appointment.id, latestNotes.current);
        dirty.current = false;
        setSaveState("saved");
        onAppointmentChange(updated);
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [notes, appointment.id, onAppointmentChange]);

  async function generate() {
    setGenerating(true);
    setAiError(null);
    try {
      onAppointmentChange(await api.apiGenerateInterviewQuestions(appointment.id, extra));
    } catch (err) {
      setAiError(errorText(err));
    } finally {
      setGenerating(false);
    }
  }

  const ai = appointment.aiQuestions;

  return (
    <div className="space-y-6 text-sm">
      <section>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">My notes</p>
          <span className="text-xs text-muted">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
            {saveState === "error" && <span className="text-danger">Couldn&apos;t save</span>}
          </span>
        </div>
        <Textarea
          aria-label="Interview notes"
          rows={7}
          className="mt-2"
          placeholder="Notes stay saved with this interview…"
          value={notes}
          onChange={(e) => {
            dirty.current = true;
            setNotes(e.target.value);
          }}
        />
      </section>

      <section className="border-t border-border pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">AI interview questions</p>
        <p className="mt-1 text-xs text-muted">
          Built from the CV, GitHub, LinkedIn and job description, written to feel like a natural
          conversation.
        </p>
        <Textarea
          aria-label="Extra instructions for the AI"
          rows={2}
          className="mt-3"
          placeholder="Optional: what should this interview prioritise? e.g. system design, communication, culture fit…"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
        <Button size="sm" className="mt-2" onClick={generate} loading={generating}>
          <Sparkles className="h-3.5 w-3.5" />
          {ai ? "Regenerate questions" : "Get interview questions"}
        </Button>
        {aiError && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{aiError}</p>}

        {ai && (
          <div className="mt-4 space-y-3">
            {appointment.aiQuestionsPrompt && (
              <p className="text-xs text-muted">
                Prioritised: <span className="text-foreground">{appointment.aiQuestionsPrompt}</span>
              </p>
            )}
            <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-xs text-primary">
              <span className="font-medium">Open with: </span>
              {ai.opening}
            </div>
            <ol className="space-y-2">
              {ai.questions.map((q, i) => (
                <li key={i} className="rounded-lg border border-border">
                  <button
                    onClick={() => setOpen(open === i ? null : i)}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left cursor-pointer"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[11px] uppercase tracking-wide text-muted">
                        {q.topic} · {q.source.replace("_", " ")}
                      </span>
                      <span className="block text-sm text-foreground">{q.question}</span>
                    </span>
                    <ChevronDown
                      className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${
                        open === i ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open === i && (
                    <div className="space-y-1.5 border-t border-border px-3 py-2.5 text-xs text-muted">
                      <p>
                        <span className="font-medium text-foreground">Why: </span>
                        {q.why}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Follow-up: </span>
                        {q.followUp}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-muted">
              <span className="font-medium text-foreground">Close with: </span>
              {ai.closing}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live AI assistance
// ---------------------------------------------------------------------------

export function LiveAssistPanel({
  appointmentId,
  live,
  segmentCount,
}: {
  appointmentId: string;
  live: boolean;
  segmentCount: number;
}) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LiveAssist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastCount = useRef(-1);
  const inFlight = useRef(false);
  const countRef = useRef(segmentCount);
  useEffect(() => {
    countRef.current = segmentCount;
  });

  async function run(force = false) {
    if (inFlight.current) return;
    if (!force && countRef.current === lastCount.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    lastCount.current = countRef.current;
    try {
      setResult(await api.apiLiveAssist(appointmentId));
    } catch (err) {
      setError(errorText(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    if (!enabled || !live) return;
    void runRef.current();
    const timer = window.setInterval(() => void runRef.current(), 25000);
    return () => window.clearInterval(timer);
  }, [enabled, live]);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Live AI assistance</p>
          <p className="mt-1 text-xs text-muted">
            Reads the live transcript (both speakers) and recommends what to ask next. Each refresh
            is a metered AI call, at most every ~25 seconds and only when there is new speech.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Turn live AI assistance on"
          disabled={!live}
          onClick={() => setEnabled((v) => !v)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-primary" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {!live && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted">Available once the room is live.</p>}

      {enabled && live && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void run(true)} disabled={busy}>
            <Zap className="h-3.5 w-3.5" /> Suggest now
          </Button>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
      )}

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {result && (
        <div className="space-y-3">
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-muted">{result.observation}</p>
          <ul className="space-y-2">
            {result.suggestions.map((s, i) => (
              <li key={i} className="rounded-lg border border-primary/30 bg-primary-soft/40 px-3 py-2.5">
                <p className="text-sm font-medium text-foreground">{s.question}</p>
                <p className="mt-1 text-xs text-muted">{s.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
