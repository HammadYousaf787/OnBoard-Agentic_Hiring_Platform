"use client";

import { FormEvent, useEffect, useState } from "react";
import { Archive, X } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Textarea } from "@/components/ui/Field";
import { DemoTag } from "@/components/ui/DemoTag";

export function RejectApplicantModal({
  open,
  onClose,
  applicantId,
  applicantName,
}: {
  open: boolean;
  onClose: () => void;
  applicantId: string;
  applicantName: string;
}) {
  const { currentUser, rejectApplicant } = useAppData();
  const autoSave = !!currentUser?.autoSaveCvBankOnReject;

  const [note, setNote] = useState("");
  const [saveToCvBank, setSaveToCvBank] = useState(autoSave);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setSaveToCvBank(autoSave);
      setError(null);
    }
  }, [open, autoSave]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await rejectApplicant(applicantId, {
      saveToCvBank,
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Reject ${applicantName}`} width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldGroup label="Reason (optional)" htmlFor="reject-note">
          <Textarea
            id="reject-note"
            rows={3}
            placeholder="Internal note about why this candidate wasn't a fit..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FieldGroup>

        {autoSave ? (
          <div className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-xs text-primary">
            <Archive className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <DemoTag /> Auto-save is enabled in your settings — this candidate&apos;s info
              will be saved to the CV bank automatically.
            </span>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              checked={saveToCvBank}
              onChange={(e) => setSaveToCvBank(e.target.checked)}
            />
            Save this candidate&apos;s info to the CV bank for future opportunities
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={submitting}>
            <X className="h-4 w-4" />
            Reject candidate
          </Button>
        </div>
      </form>
    </Modal>
  );
}
