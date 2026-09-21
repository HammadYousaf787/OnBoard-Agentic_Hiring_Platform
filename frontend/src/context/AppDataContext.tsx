"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import * as api from "@/lib/api";
import { ApiError, hasStoredSession, loadTokensFromStorage, type BulkAction } from "@/lib/api";
import {
  AiUsageSummary,
  Applicant,
  Appointment,
  CvBankEntry,
  Job,
  JobStatus,
  Role,
  UserAccount,
} from "@/lib/types";

interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  title?: string;
}

interface AddHrInput {
  name: string;
  email: string;
  password: string;
  title?: string;
  department?: string;
  phone?: string;
}

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

interface RejectApplicantInput {
  saveToCvBank: boolean;
  note?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

interface AppDataContextValue {
  ready: boolean;
  users: UserAccount[];
  jobs: Job[];
  applicants: Applicant[];
  appointments: Appointment[];
  cvBank: CvBankEntry[];
  currentUser: UserAccount | null;
  aiUsage: AiUsageSummary | null;

  login: (email: string, password: string) => Promise<ActionResult>;
  logout: () => void;
  signup: (input: SignupInput) => Promise<ActionResult>;

  approveUser: (userId: string, note?: string) => Promise<ActionResult>;
  rejectUser: (userId: string, note?: string) => Promise<ActionResult>;

  addHr: (input: AddHrInput) => Promise<ActionResult>;
  removeHr: (userId: string, note?: string) => Promise<ActionResult>;
  reinstateHr: (userId: string, note?: string) => Promise<ActionResult>;

  addJob: (input: JobInput) => Promise<ActionResult>;
  updateJob: (jobId: string, input: JobInput) => Promise<ActionResult>;
  removeJob: (jobId: string) => Promise<ActionResult>;
  assignHr: (jobId: string, hrId: string | undefined) => Promise<ActionResult>;

  runAiReviewForAll: (
    applicantIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ succeeded: number; failed: number; firstError?: string }>;
  setApplicantOrder: (jobId: string, applicantIds: string[]) => Promise<ActionResult>;
  bulkApplicantAction: (
    jobId: string,
    applicantIds: string[],
    action: BulkAction
  ) => Promise<ActionResult>;
  runAiJobReview: (applicantId: string) => Promise<ActionResult>;
  refreshAiUsage: () => Promise<void>;

  passToInterview: (applicantId: string) => Promise<ActionResult>;
  forwardCodingAssessment: (applicantId: string) => Promise<ActionResult>;
  scheduleAppointment: (
    applicantId: string,
    jobId: string,
    dateTime: string,
    notifyDayBefore: boolean
  ) => Promise<ActionResult>;
  rescheduleAppointment: (appointmentId: string, dateTime: string) => Promise<ActionResult>;
  toggleNotifyDayBefore: (appointmentId: string) => Promise<ActionResult>;
  setupInterviewRooms: (appointmentIds: string[]) => Promise<ActionResult>;
  removeAppointment: (appointmentId: string) => Promise<ActionResult>;
  applyAppointmentUpdate: (appointment: Appointment) => void;
  saveHrAssessment: (
    applicantId: string,
    patch: { hrScore?: number | null; hrNotes?: string }
  ) => Promise<ActionResult>;
  acceptApplicant: (applicantId: string) => Promise<ActionResult>;
  rejectApplicant: (applicantId: string, input: RejectApplicantInput) => Promise<ActionResult>;
  saveApplicantToCvBank: (applicantId: string) => Promise<ActionResult>;
  removeCvBankEntry: (entryId: string) => Promise<ActionResult>;
  updateHrSettings: (patch: Partial<Pick<UserAccount, "autoSaveCvBankOnReject">>) => Promise<ActionResult>;

  getApplicantCvUrl: (applicantId: string, inline?: boolean) => Promise<string | null>;
  getCvBankEntryCvUrl: (entryId: string, inline?: boolean) => Promise<string | null>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

function replaceById<T extends { id: string }>(list: T[], updated: T): T[] {
  return list.map((item) => (item.id === updated.id ? updated : item));
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cvBank, setCvBank] = useState<CvBankEntry[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);

  const refreshAiUsage = useCallback(async () => {
    try {
      setAiUsage(await api.apiGetAiUsageSummary());
    } catch {
      // Admin-only endpoint -- silently ignore for HR sessions (403) or
      // transient failures; the meter just won't update this time.
    }
  }, []);

  const loadWorkspace = useCallback(
    async (role: Role) => {
      const [usersResult, jobsResult, appointmentsResult, cvBankResult] = await Promise.all([
        role === "admin" ? api.apiListUsers() : Promise.resolve([]),
        api.apiListJobs(),
        api.apiListAppointments(),
        api.apiListCvBank(),
      ]);
      const applicantLists = await Promise.all(
        jobsResult.map((job) => api.apiListApplicantsForJob(job.id))
      );

      setUsers(usersResult);
      setJobs(jobsResult);
      setApplicants(applicantLists.flat());
      setAppointments(appointmentsResult);
      setCvBank(cvBankResult);

      if (role === "admin") {
        await refreshAiUsage();
      }
    },
    [refreshAiUsage]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      loadTokensFromStorage();
      if (!hasStoredSession()) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const user = await api.apiGetMe();
        if (cancelled) return;
        setCurrentUser(user);
        await loadWorkspace(user.role);
      } catch {
        api.apiLogout();
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

  // New applications arrive from the separate public apply portal, straight
  // into the backend -- this session has no push channel, so quietly re-sync
  // in the background while the tab is visible.
  const currentRole = currentUser?.role;
  useEffect(() => {
    if (!currentRole) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadWorkspace(currentRole).catch(() => {
        // Transient failure (network, expired session) -- try again next tick.
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [currentRole, loadWorkspace]);

  async function login(email: string, password: string): Promise<ActionResult> {
    try {
      const { user } = await api.apiLogin(email, password);
      setCurrentUser(user);
      await loadWorkspace(user.role);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  function logout() {
    api.apiLogout();
    setCurrentUser(null);
    setUsers([]);
    setJobs([]);
    setApplicants([]);
    setAppointments([]);
    setCvBank([]);
    setAiUsage(null);
  }

  async function signup(input: SignupInput): Promise<ActionResult> {
    try {
      await api.apiSignup(input);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function approveUser(userId: string, note?: string): Promise<ActionResult> {
    try {
      const updated = await api.apiApproveUser(userId, note);
      setUsers((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function rejectUser(userId: string, note?: string): Promise<ActionResult> {
    try {
      const updated = await api.apiRejectUser(userId, note);
      setUsers((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function addHr(input: AddHrInput): Promise<ActionResult> {
    try {
      const created = await api.apiCreateHr(input);
      setUsers((prev) => [...prev, created]);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function removeHr(userId: string, note?: string): Promise<ActionResult> {
    try {
      const updated = await api.apiRemoveHr(userId, note);
      setUsers((prev) => replaceById(prev, updated));
      setJobs((prev) => prev.map((j) => (j.assignedHrId === userId ? { ...j, assignedHrId: undefined } : j)));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function reinstateHr(userId: string, note?: string): Promise<ActionResult> {
    try {
      const updated = await api.apiReinstateHr(userId, note);
      setUsers((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function addJob(input: JobInput): Promise<ActionResult> {
    try {
      const created = await api.apiCreateJob(input);
      setJobs((prev) => [created, ...prev]);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function updateJob(jobId: string, input: JobInput): Promise<ActionResult> {
    try {
      const updated = await api.apiUpdateJob(jobId, input);
      setJobs((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function removeJob(jobId: string): Promise<ActionResult> {
    try {
      await api.apiDeleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setApplicants((prev) => prev.filter((a) => a.jobId !== jobId));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function assignHr(jobId: string, hrId: string | undefined): Promise<ActionResult> {
    try {
      const updated = await api.apiAssignHr(jobId, hrId);
      setJobs((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function runAiReviewForAll(
    applicantIds: string[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ succeeded: number; failed: number; firstError?: string }> {
    let next = 0;
    let done = 0;
    let succeeded = 0;
    let firstError: string | undefined;
    const worker = async () => {
      while (next < applicantIds.length) {
        const id = applicantIds[next++];
        const result = await runAiJobReview(id);
        done += 1;
        if (result.success) succeeded += 1;
        else firstError ??= result.error;
        onProgress?.(done, applicantIds.length);
      }
    };
    await worker();
    return { succeeded, failed: applicantIds.length - succeeded, firstError };
  }

  async function setApplicantOrder(jobId: string, applicantIds: string[]): Promise<ActionResult> {
    try {
      const updated = await api.apiSetApplicantOrder(jobId, applicantIds);
      setApplicants((prev) => {
        const byId = new Map(updated.map((a) => [a.id, a]));
        return prev.map((a) => byId.get(a.id) ?? a);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function bulkApplicantAction(
    jobId: string,
    applicantIds: string[],
    action: BulkAction
  ): Promise<ActionResult> {
    try {
      const updated = await api.apiBulkApplicantAction(jobId, applicantIds, action);
      setApplicants((prev) => {
        const byId = new Map(updated.map((a) => [a.id, a]));
        return prev.map((a) => byId.get(a.id) ?? a);
      });
      if (updated.some((a) => a.savedToCvBank)) {
        setCvBank(await api.apiListCvBank());
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function runAiJobReview(applicantId: string): Promise<ActionResult> {
    try {
      const updated = await api.apiRunAiJobReview(applicantId);
      setApplicants((prev) => replaceById(prev, updated));
      await refreshAiUsage();
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function passToInterview(applicantId: string): Promise<ActionResult> {
    try {
      const updated = await api.apiPassToInterview(applicantId);
      setApplicants((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function forwardCodingAssessment(applicantId: string): Promise<ActionResult> {
    try {
      const updated = await api.apiForwardCodingAssessment(applicantId);
      setApplicants((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function scheduleAppointment(
    applicantId: string,
    jobId: string,
    dateTime: string,
    notifyDayBefore: boolean
  ): Promise<ActionResult> {
    try {
      const created = await api.apiScheduleInterview(applicantId, dateTime, notifyDayBefore);
      setAppointments((prev) => [...prev, created]);
      setApplicants((prev) =>
        prev.map((a) => (a.id === applicantId ? { ...a, stage: "interview_scheduled" } : a))
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function rescheduleAppointment(appointmentId: string, dateTime: string): Promise<ActionResult> {
    try {
      const updated = await api.apiRescheduleAppointment(appointmentId, dateTime);
      setAppointments((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function toggleNotifyDayBefore(appointmentId: string): Promise<ActionResult> {
    try {
      const updated = await api.apiToggleNotifyDayBefore(appointmentId);
      setAppointments((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function setupInterviewRooms(appointmentIds: string[]): Promise<ActionResult> {
    try {
      const updated = await api.apiSetupRooms(appointmentIds);
      setAppointments((prev) => {
        const byId = new Map(updated.map((a) => [a.id, a]));
        return prev.map((a) => byId.get(a.id) ?? a);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function saveHrAssessment(
    applicantId: string,
    patch: { hrScore?: number | null; hrNotes?: string }
  ): Promise<ActionResult> {
    try {
      const updated = await api.apiSaveHrAssessment(applicantId, patch);
      setApplicants((prev) => replaceById(prev, updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function removeAppointment(appointmentId: string): Promise<ActionResult> {
    try {
      const applicant = await api.apiDeleteAppointment(appointmentId);
      setAppointments((prev) => prev.filter((a) => a.id !== appointmentId));
      setApplicants((prev) => replaceById(prev, applicant));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  function applyAppointmentUpdate(appointment: Appointment) {
    setAppointments((prev) => replaceById(prev, appointment));
  }

  async function acceptApplicant(applicantId: string): Promise<ActionResult> {
    try {
      const updated = await api.apiAcceptApplicant(applicantId);
      setApplicants((prev) => replaceById(prev, updated));
      const freshJob = await api.apiGetJob(updated.jobId);
      setJobs((prev) => replaceById(prev, freshJob));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function rejectApplicant(applicantId: string, input: RejectApplicantInput): Promise<ActionResult> {
    try {
      const updated = await api.apiRejectApplicant(applicantId, input);
      setApplicants((prev) => replaceById(prev, updated));
      if (updated.savedToCvBank) {
        setCvBank(await api.apiListCvBank());
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function saveApplicantToCvBank(applicantId: string): Promise<ActionResult> {
    try {
      const updated = await api.apiSaveApplicantToCvBank(applicantId);
      setApplicants((prev) => replaceById(prev, updated));
      setCvBank(await api.apiListCvBank());
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function removeCvBankEntry(entryId: string): Promise<ActionResult> {
    try {
      await api.apiDeleteCvBankEntry(entryId);
      setCvBank((prev) => prev.filter((entry) => entry.id !== entryId));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function updateHrSettings(
    patch: Partial<Pick<UserAccount, "autoSaveCvBankOnReject">>
  ): Promise<ActionResult> {
    try {
      const updated = await api.apiUpdateHrSettings({
        autoSaveCvBankOnReject: !!patch.autoSaveCvBankOnReject,
      });
      setCurrentUser(updated);
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async function getApplicantCvUrl(applicantId: string, inline = false): Promise<string | null> {
    try {
      return await api.apiGetApplicantCvUrl(applicantId, inline);
    } catch {
      return null;
    }
  }

  async function getCvBankEntryCvUrl(entryId: string, inline = false): Promise<string | null> {
    try {
      return await api.apiGetCvBankEntryCvUrl(entryId, inline);
    } catch {
      return null;
    }
  }

  const value: AppDataContextValue = {
    ready,
    users,
    jobs,
    applicants,
    appointments,
    cvBank,
    currentUser,
    aiUsage,
    login,
    logout,
    signup,
    approveUser,
    rejectUser,
    addHr,
    removeHr,
    reinstateHr,
    addJob,
    updateJob,
    removeJob,
    assignHr,
    runAiReviewForAll,
    setApplicantOrder,
    bulkApplicantAction,
    runAiJobReview,
    refreshAiUsage,
    passToInterview,
    forwardCodingAssessment,
    scheduleAppointment,
    rescheduleAppointment,
    toggleNotifyDayBefore,
    setupInterviewRooms,
    removeAppointment,
    applyAppointmentUpdate,
    saveHrAssessment,
    acceptApplicant,
    rejectApplicant,
    saveApplicantToCvBank,
    removeCvBankEntry,
    updateHrSettings,
    getApplicantCvUrl,
    getCvBankEntryCvUrl,
  };

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }
  return ctx;
}
