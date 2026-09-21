import {
  AccountStatus,
  AiReviewDetails,
  AiUsageSummary,
  Applicant,
  ApplicantStage,
  Appointment,
  ApprovalAction,
  CvBankEntry,
  Job,
  JobStatus,
  Role,
  UserAccount,
  LiveAssist,
  RoomStatus,
  RtcCredentials,
  TranscriptSegment,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const ACCESS_TOKEN_KEY = "eop_access_token";
const REFRESH_TOKEN_KEY = "eop_refresh_token";

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;

export function loadTokensFromStorage(): void {
  if (typeof window === "undefined") return;
  accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  refreshTokenValue = window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function hasStoredSession(): boolean {
  return !!accessToken;
}

function persistTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshTokenValue = refresh;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
}

export function clearTokens(): void {
  accessToken = null;
  refreshTokenValue = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ");
    }
  } catch {
    // response body wasn't JSON
  }
  return res.statusText || "Something went wrong.";
}

async function rawRequest(path: string, options: RequestInit, withAuth: boolean): Promise<Response> {
  const headers = new Headers(options.headers);
  if (withAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
}

async function tryRefreshTokens(): Promise<boolean> {
  if (!refreshTokenValue) return false;
  const res = await rawRequest(
    "/auth/refresh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
    },
    false
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  persistTokens(data.access_token, data.refresh_token);
  return true;
}

async function request<T>(path: string, options: RequestInit = {}, withAuth = true): Promise<T> {
  let res = await rawRequest(path, options, withAuth);

  if (res.status === 401 && withAuth && path !== "/auth/refresh") {
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      res = await rawRequest(path, options, withAuth);
    }
  }

  if (!res.ok) {
    const message = await extractErrorMessage(res);
    if (res.status === 401) clearTokens();
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function deriveUsername(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 40);
  return cleaned || "user";
}

// ---------------------------------------------------------------------------
// Raw backend (snake_case) shapes
// ---------------------------------------------------------------------------

interface BackendApprovalEvent {
  id: string;
  action: ApprovalAction;
  by_user_id: string | null;
  by_user_name: string;
  note: string | null;
  created_at: string;
}

interface BackendUser {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  country: string | null;
  city: string | null;
  role: Role;
  status: AccountStatus;
  title: string | null;
  department: string | null;
  is_demo: boolean;
  auto_save_cv_bank_on_reject: boolean;
  created_at: string;
  updated_at: string;
  approval_events?: BackendApprovalEvent[];
}

interface BackendJob {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  seats: number;
  filled_seats: number;
  salary_min: number;
  salary_max: number;
  currency: string;
  status: JobStatus;
  collect_github: boolean;
  assigned_hr_id: string | null;
  created_by_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  applicant_count: number;
}

interface BackendApplicant {
  id: string;
  job_id: string;
  name: string;
  email: string;
  phone_number: string;
  country: string | null;
  city: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  experience_years: number;
  cv_file_name: string | null;
  cv_summary: string | null;
  cover_letter: string | null;
  applied_date: string;
  stage: ApplicantStage;
  rejection_note: string | null;
  saved_to_cv_bank: boolean;
  communication_score: number | null;
  jd_overlap_score: number | null;
  linkedin_score: number | null;
  github_score: number | null;
  overall_score: number | null;
  ranked_at: string | null;
  ai_review_details: BackendAiReviewDetails | null;
  manual_rank: number | null;
  hr_score: number | null;
  hr_notes: string | null;
  is_demo: boolean;
}

interface BackendAiReviewCategory {
  score: number;
  reasoning: string;
}

interface BackendAiReviewDetails {
  communication: BackendAiReviewCategory;
  jd_overlap: BackendAiReviewCategory;
  github: BackendAiReviewCategory;
  linkedin: BackendAiReviewCategory;
  overall: BackendAiReviewCategory;
  github_available: boolean;
  linkedin_available: boolean;
  github_error: string | null;
  linkedin_error: string | null;
  model: string;
  generated_at: string;
}

interface BackendAiUsageEvent {
  id: string;
  provider: string;
  model_name: string;
  purpose: string;
  applicant_id: string | null;
  triggered_by_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

interface BackendAiUsageSummary {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  by_provider: Record<string, number>;
  recent_events: BackendAiUsageEvent[];
}

interface BackendAppointment {
  id: string;
  applicant_id: string;
  job_id: string;
  hr_id: string;
  scheduled_at: string;
  notify_day_before: boolean;
  created_at: string;
  room_token: string | null;
  room_status: RoomStatus;
  room_started_at: string | null;
  room_ended_at: string | null;
  recording_enabled: boolean;
  interviewer_notes: string | null;
  interviewer_review: string | null;
  interviewer_reviewed_at: string | null;
  ai_questions: {
    opening: string;
    questions: {
      topic: string;
      question: string;
      why: string;
      follow_up: string;
      source: string;
    }[];
    closing: string;
  } | null;
  ai_questions_prompt: string | null;
  ai_questions_generated_at: string | null;
  has_transcript: boolean;
  transcript_segment_count: number | null;
  has_recording: boolean;
  recording_size_bytes: number | null;
}

interface BackendCvBankEntry {
  id: string;
  applicant_id: string | null;
  name: string;
  email: string;
  phone_number: string | null;
  country: string | null;
  city: string | null;
  cv_file_name: string | null;
  cv_summary: string | null;
  experience_years: number;
  linkedin_url: string | null;
  github_url: string | null;
  source_job_id: string | null;
  source_job_title: string;
  rejected_by_id: string | null;
  rejected_by_name: string;
  rejected_at: string;
  note: string | null;
  is_demo: boolean;
}

// ---------------------------------------------------------------------------
// Mappers: backend (snake_case) -> frontend (camelCase) shapes
// ---------------------------------------------------------------------------

function mapApprovalEvent(e: BackendApprovalEvent) {
  return {
    id: e.id,
    action: e.action,
    byUserId: e.by_user_id ?? "system",
    byUserName: e.by_user_name,
    date: e.created_at,
    note: e.note ?? undefined,
  };
}

function mapUser(u: BackendUser): UserAccount {
  return {
    id: u.id,
    username: u.username,
    name: u.full_name,
    email: u.email,
    role: u.role,
    status: u.status,
    title: u.title ?? undefined,
    department: u.department ?? undefined,
    phone: u.phone_number ?? undefined,
    country: u.country ?? undefined,
    city: u.city ?? undefined,
    createdAt: u.created_at,
    approvalHistory: (u.approval_events ?? []).map(mapApprovalEvent),
    isDemo: u.is_demo,
    autoSaveCvBankOnReject: u.auto_save_cv_bank_on_reject,
  };
}

function mapJob(j: BackendJob): Job {
  return {
    id: j.id,
    title: j.title,
    department: j.department,
    location: j.location,
    description: j.description,
    seats: j.seats,
    filledSeats: j.filled_seats,
    salaryMin: j.salary_min,
    salaryMax: j.salary_max,
    currency: j.currency,
    status: j.status,
    collectGithub: j.collect_github,
    assignedHrId: j.assigned_hr_id ?? undefined,
    createdAt: j.created_at,
    createdBy: j.created_by_id,
    isDemo: j.is_demo,
  };
}

function mapApplicant(a: BackendApplicant): Applicant {
  const hasScores = a.overall_score !== null && a.overall_score !== undefined;
  return {
    id: a.id,
    jobId: a.job_id,
    name: a.name,
    email: a.email,
    phone: a.phone_number,
    country: a.country ?? undefined,
    city: a.city ?? undefined,
    appliedDate: a.applied_date,
    cvFileName: a.cv_file_name ?? "",
    cvSummary: a.cv_summary ?? "",
    experienceYears: a.experience_years,
    linkedinUrl: a.linkedin_url ?? undefined,
    githubUrl: a.github_url ?? undefined,
    coverLetter: a.cover_letter ?? undefined,
    aiScores: hasScores
      ? {
          communication: a.communication_score as number,
          jdOverlap: a.jd_overlap_score as number,
          linkedin: a.linkedin_score as number,
          github: a.github_score as number,
          overall: a.overall_score as number,
          rankedAt: a.ranked_at as string,
        }
      : undefined,
    aiReviewDetails: a.ai_review_details ? mapAiReviewDetails(a.ai_review_details) : undefined,
    manualRank: a.manual_rank ?? undefined,
    hrScore: a.hr_score ?? undefined,
    hrNotes: a.hr_notes ?? undefined,
    stage: a.stage,
    rejectionNote: a.rejection_note ?? undefined,
    savedToCvBank: a.saved_to_cv_bank,
    isDemo: a.is_demo,
  };
}

function mapAiReviewDetails(d: BackendAiReviewDetails): AiReviewDetails {
  return {
    communication: d.communication,
    jdOverlap: d.jd_overlap,
    github: d.github,
    linkedin: d.linkedin,
    overall: d.overall,
    githubAvailable: d.github_available,
    linkedinAvailable: d.linkedin_available,
    githubError: d.github_error ?? undefined,
    linkedinError: d.linkedin_error ?? undefined,
    model: d.model,
    generatedAt: d.generated_at,
  };
}

function mapAiUsageSummary(s: BackendAiUsageSummary): AiUsageSummary {
  return {
    totalCalls: s.total_calls,
    successfulCalls: s.successful_calls,
    failedCalls: s.failed_calls,
    totalTokens: s.total_tokens,
    totalPromptTokens: s.total_prompt_tokens,
    totalCompletionTokens: s.total_completion_tokens,
    byProvider: s.by_provider,
    recentEvents: s.recent_events.map((e) => ({
      id: e.id,
      provider: e.provider,
      modelName: e.model_name,
      purpose: e.purpose,
      applicantId: e.applicant_id ?? undefined,
      triggeredById: e.triggered_by_id ?? undefined,
      promptTokens: e.prompt_tokens ?? undefined,
      completionTokens: e.completion_tokens ?? undefined,
      totalTokens: e.total_tokens ?? undefined,
      success: e.success,
      errorMessage: e.error_message ?? undefined,
      createdAt: e.created_at,
    })),
  };
}

function mapAppointment(a: BackendAppointment): Appointment {
  return {
    id: a.id,
    applicantId: a.applicant_id,
    jobId: a.job_id,
    hrId: a.hr_id,
    dateTime: a.scheduled_at,
    notifyDayBefore: a.notify_day_before,
    createdAt: a.created_at,
    roomToken: a.room_token ?? undefined,
    roomStatus: a.room_status,
    roomStartedAt: a.room_started_at ?? undefined,
    roomEndedAt: a.room_ended_at ?? undefined,
    recordingEnabled: a.recording_enabled,
    interviewerNotes: a.interviewer_notes ?? undefined,
    interviewerReview: a.interviewer_review ?? undefined,
    interviewerReviewedAt: a.interviewer_reviewed_at ?? undefined,
    aiQuestions: a.ai_questions
      ? {
          opening: a.ai_questions.opening,
          closing: a.ai_questions.closing,
          questions: a.ai_questions.questions.map((q) => ({
            topic: q.topic,
            question: q.question,
            why: q.why,
            followUp: q.follow_up,
            source: q.source,
          })),
        }
      : undefined,
    aiQuestionsPrompt: a.ai_questions_prompt ?? undefined,
    aiQuestionsGeneratedAt: a.ai_questions_generated_at ?? undefined,
    hasTranscript: a.has_transcript,
    transcriptSegmentCount: a.transcript_segment_count ?? undefined,
    hasRecording: a.has_recording,
    recordingSizeBytes: a.recording_size_bytes ?? undefined,
  };
}

function mapCvBankEntry(e: BackendCvBankEntry): CvBankEntry {
  return {
    id: e.id,
    applicantId: e.applicant_id ?? "",
    name: e.name,
    email: e.email,
    phone: e.phone_number ?? "",
    country: e.country ?? undefined,
    city: e.city ?? undefined,
    cvFileName: e.cv_file_name ?? "",
    cvSummary: e.cv_summary ?? "",
    experienceYears: e.experience_years,
    linkedinUrl: e.linkedin_url ?? undefined,
    githubUrl: e.github_url ?? undefined,
    sourceJobId: e.source_job_id ?? "",
    sourceJobTitle: e.source_job_title,
    rejectedAt: e.rejected_at,
    rejectedById: e.rejected_by_id ?? "",
    rejectedByName: e.rejected_by_name,
    note: e.note ?? undefined,
    isDemo: e.is_demo,
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiLogin(
  emailOrUsername: string,
  password: string
): Promise<{ user: UserAccount }> {
  const form = new URLSearchParams();
  form.set("username", emailOrUsername);
  form.set("password", password);

  const tokens = await request<{ access_token: string; refresh_token: string }>(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    false
  );
  persistTokens(tokens.access_token, tokens.refresh_token);

  const me = await request<BackendUser>("/auth/me");
  return { user: mapUser(me) };
}

export function apiLogout(): void {
  clearTokens();
}

export async function apiSignup(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  title?: string;
}): Promise<void> {
  await request(
    "/auth/signup",
    {
      method: "POST",
      ...json({
        username: deriveUsername(input.email),
        full_name: input.name,
        email: input.email,
        password: input.password,
        role: input.role,
        title: input.title || undefined,
      }),
    },
    false
  );
}

export async function apiGetMe(): Promise<UserAccount> {
  return mapUser(await request<BackendUser>("/auth/me"));
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

export async function apiListUsers(): Promise<UserAccount[]> {
  return (await request<BackendUser[]>("/users")).map(mapUser);
}

export async function apiCreateHr(input: {
  name: string;
  email: string;
  password: string;
  title?: string;
  department?: string;
  phone?: string;
}): Promise<UserAccount> {
  const created = await request<BackendUser>("/users/hr", {
    method: "POST",
    ...json({
      username: deriveUsername(input.email),
      full_name: input.name,
      email: input.email,
      password: input.password,
      title: input.title || undefined,
      department: input.department || undefined,
      phone_number: input.phone || undefined,
    }),
  });
  return mapUser(created);
}

export async function apiApproveUser(userId: string, note?: string): Promise<UserAccount> {
  return mapUser(await request<BackendUser>(`/users/${userId}/approve`, { method: "POST", ...json({ note }) }));
}

export async function apiRejectUser(userId: string, note?: string): Promise<UserAccount> {
  return mapUser(await request<BackendUser>(`/users/${userId}/reject`, { method: "POST", ...json({ note }) }));
}

export async function apiRemoveHr(userId: string, note?: string): Promise<UserAccount> {
  return mapUser(await request<BackendUser>(`/users/${userId}/remove`, { method: "POST", ...json({ note }) }));
}

export async function apiReinstateHr(userId: string, note?: string): Promise<UserAccount> {
  return mapUser(await request<BackendUser>(`/users/${userId}/reinstate`, { method: "POST", ...json({ note }) }));
}

export async function apiUpdateHrSettings(patch: {
  autoSaveCvBankOnReject: boolean;
}): Promise<UserAccount> {
  return mapUser(
    await request<BackendUser>("/users/me/settings", {
      method: "PATCH",
      ...json({ auto_save_cv_bank_on_reject: patch.autoSaveCvBankOnReject }),
    })
  );
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

interface JobInput {
  title: string;
  department: string;
  location: string;
  description: string;
  seats: number;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  status: JobStatus;
  collectGithub: boolean;
  assignedHrId?: string;
}

function toJobPayload(input: JobInput) {
  return {
    title: input.title,
    department: input.department,
    location: input.location,
    description: input.description,
    seats: input.seats,
    salary_min: input.salaryMin,
    salary_max: input.salaryMax,
    currency: input.currency,
    status: input.status,
    collect_github: input.collectGithub,
    assigned_hr_id: input.assignedHrId ?? null,
  };
}

export async function apiListJobs(): Promise<Job[]> {
  return (await request<BackendJob[]>("/jobs")).map(mapJob);
}

export async function apiGetJob(jobId: string): Promise<Job> {
  return mapJob(await request<BackendJob>(`/jobs/${jobId}`));
}

export async function apiCreateJob(input: JobInput): Promise<Job> {
  return mapJob(await request<BackendJob>("/jobs", { method: "POST", ...json(toJobPayload(input)) }));
}

export async function apiUpdateJob(jobId: string, input: JobInput): Promise<Job> {
  return mapJob(
    await request<BackendJob>(`/jobs/${jobId}`, { method: "PATCH", ...json(toJobPayload(input)) })
  );
}

export async function apiDeleteJob(jobId: string): Promise<void> {
  await request<void>(`/jobs/${jobId}`, { method: "DELETE" });
}

export async function apiAssignHr(jobId: string, hrId: string | undefined): Promise<Job> {
  return mapJob(
    await request<BackendJob>(`/jobs/${jobId}/assign-hr`, {
      method: "POST",
      ...json({ hr_id: hrId ?? null }),
    })
  );
}

export async function apiSetApplicantOrder(
  jobId: string,
  applicantIds: string[]
): Promise<Applicant[]> {
  return (
    await request<BackendApplicant[]>(`/jobs/${jobId}/applicants/order`, {
      method: "PUT",
      ...json({ applicant_ids: applicantIds }),
    })
  ).map(mapApplicant);
}

export type BulkAction = "pass_to_interview" | "coding_assessment" | "reject";

export async function apiBulkApplicantAction(
  jobId: string,
  applicantIds: string[],
  action: BulkAction
): Promise<Applicant[]> {
  return (
    await request<BackendApplicant[]>(`/jobs/${jobId}/applicants/bulk-action`, {
      method: "POST",
      ...json({ applicant_ids: applicantIds, action }),
    })
  ).map(mapApplicant);
}

export async function apiListApplicantsForJob(jobId: string): Promise<Applicant[]> {
  return (await request<BackendApplicant[]>(`/jobs/${jobId}/applicants`)).map(mapApplicant);
}

// ---------------------------------------------------------------------------
// Applicants
// ---------------------------------------------------------------------------

export async function apiGetApplicantCvUrl(
  applicantId: string,
  inline = false
): Promise<string | null> {
  const res = await request<{ url: string | null }>(
    `/applicants/${applicantId}/cv-url?inline=${inline}`
  );
  return res.url;
}

export async function apiPassToInterview(applicantId: string): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/pass-to-interview`, {
      method: "POST",
    })
  );
}

export async function apiForwardCodingAssessment(applicantId: string): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/forward-coding-assessment`, {
      method: "POST",
    })
  );
}

export async function apiScheduleInterview(
  applicantId: string,
  scheduledAtIso: string,
  notifyDayBefore: boolean
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/applicants/${applicantId}/schedule-interview`, {
      method: "POST",
      ...json({ scheduled_at: scheduledAtIso, notify_day_before: notifyDayBefore }),
    })
  );
}

export async function apiAcceptApplicant(applicantId: string): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/accept`, { method: "POST" })
  );
}

export async function apiRejectApplicant(
  applicantId: string,
  input: { note?: string; saveToCvBank: boolean }
): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/reject`, {
      method: "POST",
      ...json({ note: input.note, save_to_cv_bank: input.saveToCvBank }),
    })
  );
}

export async function apiSaveApplicantToCvBank(applicantId: string): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/save-to-cv-bank`, {
      method: "POST",
    })
  );
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function apiListAppointments(): Promise<Appointment[]> {
  return (await request<BackendAppointment[]>("/appointments")).map(mapAppointment);
}

export async function apiRescheduleAppointment(
  appointmentId: string,
  scheduledAtIso: string
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/reschedule`, {
      method: "PATCH",
      ...json({ scheduled_at: scheduledAtIso }),
    })
  );
}

/** Removes an unstarted interview slot; returns the (possibly re-staged) applicant. */
export async function apiDeleteAppointment(appointmentId: string): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/appointments/${appointmentId}`, { method: "DELETE" })
  );
}

export async function apiToggleNotifyDayBefore(appointmentId: string): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/toggle-notify`, {
      method: "PATCH",
    })
  );
}

// ---------------------------------------------------------------------------
// Video interviews
// ---------------------------------------------------------------------------

interface BackendSegment {
  id: number;
  speaker_role: "interviewer" | "applicant";
  speaker_name: string;
  text: string;
  spoken_at: string;
}

function mapSegment(s: BackendSegment): TranscriptSegment {
  return {
    id: s.id,
    speakerRole: s.speaker_role,
    speakerName: s.speaker_name,
    text: s.text,
    spokenAt: s.spoken_at,
  };
}

export async function apiSetupRooms(appointmentIds: string[]): Promise<Appointment[]> {
  return (
    await request<BackendAppointment[]>("/appointments/setup-rooms", {
      method: "POST",
      ...json({ appointment_ids: appointmentIds }),
    })
  ).map(mapAppointment);
}

export async function apiGetAppointment(appointmentId: string): Promise<Appointment> {
  return mapAppointment(await request<BackendAppointment>(`/appointments/${appointmentId}`));
}

export async function apiSaveInterviewNotes(
  appointmentId: string,
  notes: string
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/notes`, {
      method: "PATCH",
      ...json({ notes }),
    })
  );
}

export async function apiGenerateInterviewQuestions(
  appointmentId: string,
  prompt: string
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/ai-questions`, {
      method: "POST",
      ...json({ prompt: prompt.trim() || null }),
    })
  );
}

export async function apiStartRoom(
  appointmentId: string,
  recordingEnabled: boolean
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/room/start`, {
      method: "POST",
      ...json({ recording_enabled: recordingEnabled }),
    })
  );
}

export async function apiSetRecordingEnabled(
  appointmentId: string,
  recordingEnabled: boolean
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/room`, {
      method: "PATCH",
      ...json({ recording_enabled: recordingEnabled }),
    })
  );
}

export async function apiGetRoomToken(appointmentId: string): Promise<RtcCredentials> {
  const r = await request<{
    app_id: string;
    channel: string;
    uid: number;
    token: string;
    display_name: string;
  }>(`/appointments/${appointmentId}/room/token`, { method: "POST" });
  return { appId: r.app_id, channel: r.channel, uid: r.uid, token: r.token, displayName: r.display_name };
}

export async function apiPostTranscriptSegment(
  appointmentId: string,
  text: string
): Promise<TranscriptSegment> {
  return mapSegment(
    await request<BackendSegment>(`/appointments/${appointmentId}/transcript`, {
      method: "POST",
      ...json({ text }),
    })
  );
}

export async function apiListTranscriptSegments(
  appointmentId: string,
  after: number
): Promise<TranscriptSegment[]> {
  return (
    await request<BackendSegment[]>(`/appointments/${appointmentId}/transcript?after=${after}`)
  ).map(mapSegment);
}

export async function apiLiveAssist(appointmentId: string): Promise<LiveAssist> {
  return await request<LiveAssist>(`/appointments/${appointmentId}/live-assist`, {
    method: "POST",
  });
}

export async function apiUploadRecording(appointmentId: string, blob: Blob): Promise<Appointment> {
  const body = new FormData();
  body.append("file", blob, "recording.webm");
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/recording`, {
      method: "POST",
      body,
    })
  );
}

export async function apiEndRoom(appointmentId: string, review?: string): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/room/end`, {
      method: "POST",
      ...json({ review: review?.trim() || null }),
    })
  );
}

export async function apiSaveInterviewReview(
  appointmentId: string,
  review: string
): Promise<Appointment> {
  return mapAppointment(
    await request<BackendAppointment>(`/appointments/${appointmentId}/review`, {
      method: "PATCH",
      ...json({ review }),
    })
  );
}

export async function apiSaveHrAssessment(
  applicantId: string,
  patch: { hrScore?: number | null; hrNotes?: string }
): Promise<Applicant> {
  const body: Record<string, unknown> = {};
  if (patch.hrScore !== undefined) body.hr_score = patch.hrScore;
  if (patch.hrNotes !== undefined) body.hr_notes = patch.hrNotes;
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/hr-assessment`, {
      method: "PATCH",
      ...json(body),
    })
  );
}

export async function apiGetFinalTranscript(
  appointmentId: string
): Promise<{ speaker: string; role: string; text: string; offsetSeconds: number | null }[]> {
  const r = await request<{
    segments: { speaker: string; role: string; text: string; offset_seconds: number | null }[];
  }>(`/appointments/${appointmentId}/transcript/final`);
  return r.segments.map((s) => ({
    speaker: s.speaker,
    role: s.role,
    text: s.text,
    offsetSeconds: s.offset_seconds,
  }));
}

export async function apiGetRecordingUrl(appointmentId: string): Promise<string | null> {
  const r = await request<{ url: string | null }>(`/appointments/${appointmentId}/recording-url`);
  return r.url;
}

// ---------------------------------------------------------------------------
// CV bank
// ---------------------------------------------------------------------------

export async function apiListCvBank(): Promise<CvBankEntry[]> {
  return (await request<BackendCvBankEntry[]>("/cv-bank")).map(mapCvBankEntry);
}

export async function apiGetCvBankEntryCvUrl(
  entryId: string,
  inline = false
): Promise<string | null> {
  const res = await request<{ url: string | null }>(`/cv-bank/${entryId}/cv-url?inline=${inline}`);
  return res.url;
}

export async function apiDeleteCvBankEntry(entryId: string): Promise<void> {
  await request<void>(`/cv-bank/${entryId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// AI Job Review (real: Gemini + GitHub + LinkedIn) and usage meter
// ---------------------------------------------------------------------------

export async function apiRunAiJobReview(applicantId: string): Promise<Applicant> {
  return mapApplicant(
    await request<BackendApplicant>(`/applicants/${applicantId}/ai-review`, { method: "POST" })
  );
}

export async function apiGetAiUsageSummary(): Promise<AiUsageSummary> {
  return mapAiUsageSummary(await request<BackendAiUsageSummary>("/ai-usage/summary"));
}
