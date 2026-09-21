const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface InterviewState {
  job_title: string;
  applicant_name: string;
  interviewer_name: string;
  scheduled_at: string;
  room_status: "not_setup" | "ready" | "live" | "ended";
  recording_enabled: boolean;
}

export interface RtcCredentials {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  displayName: string;
}

export type StateResult =
  | { status: "ok"; state: InterviewState }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function fetchInterviewState(token: string): Promise<StateResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/interviews/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: "Could not load this interview." };
    return { status: "ok", state: (await res.json()) as InterviewState };
  } catch {
    return { status: "error", message: "Could not reach the server. Retrying…" };
  }
}

export async function joinInterview(token: string): Promise<RtcCredentials> {
  const res = await fetch(`${API_BASE_URL}/public/interviews/${encodeURIComponent(token)}/join`, {
    method: "POST",
  });
  if (!res.ok) {
    let message = "Could not join the interview.";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  const r = await res.json();
  return { appId: r.app_id, channel: r.channel, uid: r.uid, token: r.token, displayName: r.display_name };
}

export async function postSegment(token: string, text: string): Promise<void> {
  await fetch(`${API_BASE_URL}/public/interviews/${encodeURIComponent(token)}/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}
