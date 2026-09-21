const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface PublicJob {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  accepting_applications: boolean;
  collect_github: boolean;
}

export type JobLookup =
  | { status: "ok"; job: PublicJob }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function fetchPublicJob(jobId: string): Promise<JobLookup> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/jobs/${encodeURIComponent(jobId)}`);
    if (res.status === 404 || res.status === 422) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: "Something went wrong loading this position." };
    return { status: "ok", job: (await res.json()) as PublicJob };
  } catch {
    return { status: "error", message: "Could not reach the server. Please try again shortly." };
  }
}

export async function fetchOpenJobs(): Promise<PublicJob[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/jobs`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicJob[];
  } catch {
    return null;
  }
}

export async function submitApplication(
  jobId: string,
  form: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/jobs/${encodeURIComponent(jobId)}/apply`, {
      method: "POST",
      body: form,
    });
    if (res.ok) return { ok: true };
    let message = "Something went wrong submitting your application.";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail) && data.detail[0]?.msg) message = data.detail[0].msg;
    } catch {
      // non-JSON error body
    }
    return { ok: false, error: message };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again shortly." };
  }
}
