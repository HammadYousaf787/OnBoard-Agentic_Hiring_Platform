"use client";

import { FormEvent, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { isoToDatetimeLocal, datetimeLocalToIso } from "@/lib/datetime";
import { validateSlot } from "@/lib/scheduling";

export function ScheduleInterviewModal({
  open,
  onClose,
  applicantId,
  jobId,
  applicantName,
  jobTitle,
}: {
  open: boolean;
  onClose: () => void;
  applicantId: string;
  jobId: string;
  applicantName: string;
  jobTitle: string;
}) {
  const { scheduleAppointment, appointments, applicants, currentUser } = useAppData();

  const defaultValue = isoToDatetimeLocal(
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  );
  const [dateTime, setDateTime] = useState(defaultValue);
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const iso = datetimeLocalToIso(dateTime);
    const problem = validateSlot(iso, appointments, {
      hrId: currentUser?.id ?? "",
      applicantId,
      nameOf: (id) => applicants.find((a) => a.id === id)?.name ?? "another candidate",
    });
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    const result = await scheduleAppointment(applicantId, jobId, iso, notify);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule interview"
      subtitle={`${applicantName} · ${jobTitle}`}
      width="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldGroup label="Interview date & time" htmlFor="appt-datetime" required>
          <Input
            id="appt-datetime"
            type="datetime-local"
            required
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
          />
        </FieldGroup>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Notify me 1 day prior to this interview
        </label>

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <CalendarClock className="h-4 w-4" />
            Schedule interview
          </Button>
        </div>
      </form>
    </Modal>
  );
}
