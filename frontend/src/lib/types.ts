export type Role = "admin" | "hr";

export type AccountStatus = "pending" | "approved" | "rejected" | "removed";

export type ApprovalAction = "approved" | "rejected" | "removed" | "reinstated";

export interface ApprovalEvent {
  id: string;
  action: ApprovalAction;
  byUserId: string;
  byUserName: string;
  date: string; // ISO timestamp
  note?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  title?: string;
  department?: string;
  phone?: string;
  country?: string;
  city?: string;
  createdAt: string;
  approvalHistory: ApprovalEvent[];
  isDemo?: boolean;
  /** HR-only preference: auto-save a rejected candidate's info to the CV bank. */
  autoSaveCvBankOnReject?: boolean;
}

export type JobStatus = "open" | "closed";

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  seats: number;
  filledSeats: number;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  status: JobStatus;
  collectGithub: boolean;
  assignedHrId?: string;
  createdAt: string;
  createdBy: string;
  isDemo?: boolean;
}

export interface AiScores {
  communication: number;
  jdOverlap: number;
  linkedin: number;
  github: number;
  overall: number;
  rankedAt: string;
}

export type ApplicantStage =
  | "applied"
  | "coding_assessment"
  | "assessment_passed"
  | "interview_scheduled"
  | "accepted"
  | "rejected";

export interface AiReviewCategory {
  score: number;
  reasoning: string;
}

/** Present only after the AI Job Review (Gemini + GitHub + LinkedIn)
 * has run for this applicant. */
export interface AiReviewDetails {
  communication: AiReviewCategory;
  jdOverlap: AiReviewCategory;
  github: AiReviewCategory;
  linkedin: AiReviewCategory;
  overall: AiReviewCategory;
  githubAvailable: boolean;
  linkedinAvailable: boolean;
  githubError?: string;
  linkedinError?: string;
  model: string;
  generatedAt: string;
}

export interface Applicant {
  id: string;
  jobId: string;
  name: string;
  email: string;
  phone: string;
  country?: string;
  city?: string;
  appliedDate: string;
  cvFileName: string;
  cvSummary: string;
  experienceYears: number;
  linkedinUrl?: string;
  githubUrl?: string;
  coverLetter?: string;
  aiScores?: AiScores;
  aiReviewDetails?: AiReviewDetails;
  /** HR's own position in the Applicants list (0 = top); overrides AI order. */
  manualRank?: number;
  /** HR's own 1-5 rating (half steps) and notes on the candidate. */
  hrScore?: number;
  hrNotes?: string;
  /** When the final hiring decision (accepted/rejected) was made. */
  decidedAt?: string;
  stage: ApplicantStage;
  rejectionNote?: string;
  savedToCvBank?: boolean;
  isDemo?: boolean;
}

export type RoomStatus = "not_setup" | "ready" | "live" | "ended";

export interface AiInterviewQuestion {
  topic: string;
  question: string;
  why: string;
  followUp: string;
  source: string;
}

export interface AiInterviewQuestions {
  opening: string;
  questions: AiInterviewQuestion[];
  closing: string;
}

export interface Appointment {
  id: string;
  applicantId: string;
  jobId: string;
  hrId: string;
  dateTime: string; // ISO
  notifyDayBefore: boolean;
  createdAt: string;
  isDemo?: boolean;

  roomToken?: string;
  roomStatus: RoomStatus;
  roomStartedAt?: string;
  roomEndedAt?: string;
  recordingEnabled: boolean;
  interviewerNotes?: string;
  interviewerReview?: string;
  interviewerReviewedAt?: string;
  aiQuestions?: AiInterviewQuestions;
  aiQuestionsPrompt?: string;
  aiQuestionsGeneratedAt?: string;
  hasTranscript: boolean;
  transcriptSegmentCount?: number;
  hasRecording: boolean;
  recordingSizeBytes?: number;
}

export interface TranscriptSegment {
  id: number;
  speakerRole: "interviewer" | "applicant";
  speakerName: string;
  text: string;
  spokenAt: string;
}

export interface RtcCredentials {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  displayName: string;
}

export interface LiveSuggestion {
  question: string;
  reason: string;
}

export interface LiveAssist {
  observation: string;
  suggestions: LiveSuggestion[];
}

export interface CvBankEntry {
  id: string;
  applicantId: string;
  name: string;
  email: string;
  phone: string;
  country?: string;
  city?: string;
  cvFileName: string;
  cvSummary: string;
  experienceYears: number;
  linkedinUrl?: string;
  githubUrl?: string;
  sourceJobId: string;
  sourceJobTitle: string;
  rejectedAt: string;
  rejectedById: string;
  rejectedByName: string;
  note?: string;
  isDemo?: boolean;
}

export interface AiUsageEvent {
  id: string;
  provider: string;
  modelName: string;
  purpose: string;
  applicantId?: string;
  triggeredById?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

export interface AiUsageSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  byProvider: Record<string, number>;
  recentEvents: AiUsageEvent[];
}

export interface AppData {
  users: UserAccount[];
  jobs: Job[];
  applicants: Applicant[];
  appointments: Appointment[];
  cvBank: CvBankEntry[];
}
