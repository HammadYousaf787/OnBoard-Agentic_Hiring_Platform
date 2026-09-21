"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, Loader2, MapPin, SearchX } from "lucide-react";
import { fetchOpenJobs, PublicJob } from "@/lib/api";
import { Shell } from "@/components/Shell";

const REFRESH_MS = 20000;

export function JobsList() {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // The list comes straight from the platform's job entries, so keep it in
  // sync: refetch periodically while visible and when the tab regains focus.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchOpenJobs();
      if (cancelled) return;
      if (result) {
        setJobs(result);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    }

    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Open positions</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a role to see the details and apply.
        </p>
      </div>

      {jobs === null && !loadFailed && (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {jobs === null && loadFailed && (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">Unable to load positions</p>
          <p className="mt-1 text-sm text-muted">
            Could not reach the server. Please try again shortly.
          </p>
        </div>
      )}

      {jobs !== null && jobs.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <SearchX className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">No open positions right now</p>
          <p className="mt-1 text-sm text-muted">Please check back soon.</p>
        </div>
      )}

      {jobs !== null && jobs.length > 0 && (
        <ul className="space-y-4">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/apply/${job.id}`}
                className="group block rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all hover:border-primary hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground group-hover:text-primary">
                      {job.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" /> {job.department}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {job.location}
                      </span>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                    Apply <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">
                  {job.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
