"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { isoToDatetimeLocal, datetimeLocalToIso } from "@/lib/datetime";
import { Appointment } from "@/lib/types";
import { validateSlot } from "@/lib/scheduling";

export function RescheduleModal({
  open,
  onClose,
  appointment,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  subtitle?: string;
}) {
  const { rescheduleAppointment, appointments, applicants } = useAppData();
  const [dateTime, setDateTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && appointment) {
      setDateTime(isoToDatetimeLocal(appointment.dateTime));
      setError(null);
    }
  }, [open, appointment]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!appointment) return;
    setError(null);
    const iso = datetimeLocalToIso(dateTime);
    const problem = validateSlot(iso, appointments, {
      hrId: appointment.hrId,
      applicantId: appointment.applicantId,
      excludeId: appointment.id,
      nameOf: (id) => applicants.find((a) => a.id === id)?.name ?? "another candidate",
    });
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    const result = await rescheduleAppointment(appointment.id, iso);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open && !!appointment}
      onClose={onClose}
      title="Reschedule interview"
      subtitle={subtitle}
      width="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldGroup label="New date & time" htmlFor="reschedule-datetime" required>
          <Input
            id="reschedule-datetime"
            type="datetime-local"
            required
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
          />
        </FieldGroup>
        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <CalendarClock className="h-4 w-4" />
            Save new time
          </Button>
        </div>
      </form>
    </Modal>
  );
}
