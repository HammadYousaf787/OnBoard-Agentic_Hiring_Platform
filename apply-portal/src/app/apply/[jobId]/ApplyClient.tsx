"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Briefcase, CheckCircle2, FileText, Loader2, MapPin, Send } from "lucide-react";
import Link from "next/link";
import { fetchPublicJob, JobLookup, submitApplication } from "@/lib/api";
import { Shell } from "@/components/Shell";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt"];

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-gray-400 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary-soft";

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon}
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function ApplyClient({ jobId }: { jobId: string }) {
  const [lookup, setLookup] = useState<JobLookup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicJob(jobId).then((result) => {
      if (!cancelled) setLookup(result);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const data = new FormData(e.currentTarget);
    const file = data.get("cv_file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Please attach your resume.");
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("Your resume must be a PDF, Word document (.doc/.docx) or .txt file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Your resume must be 10 MB or smaller.");
      return;
    }

    setSubmitting(true);
    const result = await submitApplication(jobId, data);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!lookup) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (lookup.status === "not_found") {
    return (
      <Shell>
        <Notice
          icon={<AlertCircle className="h-6 w-6" />}
          title="Position not found"
          body="This position doesn't exist or is no longer listed. Browse the open positions to find another role."
        />
      </Shell>
    );
  }

  if (lookup.status === "error") {
    return (
      <Shell>
        <Notice icon={<AlertCircle className="h-6 w-6" />} title="Unable to load" body={lookup.message} />
      </Shell>
    );
  }

  const { job } = lookup;

  if (submitted) {
    return (
      <Shell>
        <Notice
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Application submitted"
          body={`Thanks for applying for ${job.title}. Our hiring team will review your application and be in touch if there's a fit.`}
        />
        <div className="mt-4 text-center">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            View other open positions
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> All open positions
      </Link>
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{job.title}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" /> {job.department}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {job.location}
          </span>
        </div>
        <div className="mt-5 border-t border-border pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">About the role</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {job.description}
          </p>
        </div>
      </section>

      {!job.accepting_applications ? (
        <div className="mt-6">
          <Notice
            icon={<AlertCircle className="h-6 w-6" />}
            title="Applications closed"
            body="This position is no longer accepting applications."
          />
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mt-6 space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8"
        >
          <h2 className="text-base font-semibold text-foreground">Your application</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" required>
              <input id="name" name="name" required maxLength={150} className={inputClass} />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <input id="email" name="email" type="email" required maxLength={255} className={inputClass} />
            </Field>
            <Field label="Phone number" htmlFor="phone_number" required>
              <input
                id="phone_number"
                name="phone_number"
                type="tel"
                required
                maxLength={30}
                placeholder="+92 300 1234567"
                className={inputClass}
              />
            </Field>
            <Field label="Years of experience" htmlFor="experience_years" required>
              <input
                id="experience_years"
                name="experience_years"
                type="number"
                min={0}
                max={60}
                defaultValue={0}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Country" htmlFor="country" required>
              <input id="country" name="country" required maxLength={100} className={inputClass} />
            </Field>
            <Field label="City" htmlFor="city" required>
              <input id="city" name="city" required maxLength={100} className={inputClass} />
            </Field>
            <div className={job.collect_github ? "" : "sm:col-span-2"}>
              <Field label="LinkedIn profile URL" htmlFor="linkedin_url" hint="Optional">
                <input
                  id="linkedin_url"
                  name="linkedin_url"
                  placeholder="linkedin.com/in/your-name"
                  className={inputClass}
                />
              </Field>
            </div>
            {job.collect_github && (
              <Field label="GitHub profile URL" htmlFor="github_url" hint="Optional">
                <input
                  id="github_url"
                  name="github_url"
                  placeholder="github.com/your-username"
                  className={inputClass}
                />
              </Field>
            )}
          </div>

          <Field label="Cover letter" htmlFor="cover_letter" hint="Optional — tell us why you're a good fit.">
            <textarea
              id="cover_letter"
              name="cover_letter"
              rows={6}
              maxLength={5000}
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label="Resume" htmlFor="cv_file" required hint="PDF, Word document or .txt — up to 10 MB.">
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-white px-3 py-3">
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              <input
                id="cv_file"
                name="cv_file"
                type="file"
                required
                accept=".pdf,.doc,.docx,.txt"
                className="w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
              />
            </div>
          </Field>

          {/* Honeypot: hidden from real users, bots tend to fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </form>
      )}
    </Shell>
  );
}
