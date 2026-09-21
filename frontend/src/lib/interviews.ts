import { Appointment } from "@/lib/types";

/** All interviews for one candidate, oldest first (so "Interview 1" is the earliest). */
export function interviewsFor(appointments: Appointment[], applicantId: string): Appointment[] {
  return appointments
    .filter((a) => a.applicantId === applicantId)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
}
