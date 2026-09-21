"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppDataContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDateTime } from "@/lib/datetime";
import { Appointment } from "@/lib/types";

/** Confirms and removes an unstarted interview slot (e.g. one booked by mistake). */
export function RemoveInterviewDialog({
  appointment,
  candidateName,
  onClose,
  onRemoved,
}: {
  appointment: Appointment | null;
  candidateName: string;
  onClose: () => void;
  onRemoved?: () => void;
}) {
  const { removeAppointment } = useAppData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ConfirmDialog
      open={!!appointment}
      onClose={() => {
        setError(null);
        onClose();
      }}
      onConfirm={async () => {
        if (!appointment) return;
        setLoading(true);
        setError(null);
        const result = await removeAppointment(appointment.id);
        setLoading(false);
        if (!result.success) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        onClose();
        onRemoved?.();
      }}
      title="Remove interview slot"
      description={`Remove ${candidateName}'s interview on ${
        appointment ? formatDateTime(appointment.dateTime) : ""
      }? If it's their only interview they go back to Pending Scheduling.`}
      confirmLabel="Remove slot"
      danger
      loading={loading}
      error={error}
    />
  );
}
