import { useEffect, useState } from "react";
import { Appointment } from "@/lib/types";
import { formatDateTime } from "@/lib/datetime";

/** Interviews occupy a fixed slot; must match SLOT_MINUTES in the backend. */
export const SLOT_MINUTES = 60;

/** Re-renders the caller every `intervalMs` so "upcoming" lists stay current. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Not finished, and either live or still within its slot / in the future. */
export function isUpcoming(a: Appointment, nowMs: number): boolean {
  if (a.roomStatus === "ended") return false;
  if (a.roomStatus === "live") return true;
  return new Date(a.dateTime).getTime() + SLOT_MINUTES * 60000 > nowMs;
}

/** Client-side mirror of the backend's slot check, so errors name the local time. */
export function validateSlot(
  iso: string,
  appointments: Appointment[],
  opts: {
    hrId: string;
    applicantId: string;
    excludeId?: string;
    nameOf: (applicantId: string) => string;
  }
): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Enter a valid date and time.";
  if (t <= Date.now()) return "That time is in the past. Pick a date and time in the future.";

  const window = SLOT_MINUTES * 60000;
  const clash = appointments.find(
    (a) =>
      a.id !== opts.excludeId &&
      a.roomStatus !== "ended" &&
      Math.abs(new Date(a.dateTime).getTime() - t) < window &&
      (a.hrId === opts.hrId || a.applicantId === opts.applicantId)
  );
  if (!clash) return null;

  const when = formatDateTime(clash.dateTime);
  const name = opts.nameOf(clash.applicantId);
  return clash.applicantId === opts.applicantId
    ? `${name} already has an interview at ${when}, which overlaps this time. Interviews take a ${SLOT_MINUTES}-minute slot - choose a different time.`
    : `This overlaps your interview with ${name} at ${when}. Interviews take a ${SLOT_MINUTES}-minute slot - choose a different time.`;
}
