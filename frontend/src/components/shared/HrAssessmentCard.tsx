"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { Applicant } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StarInput } from "@/components/ui/StarInput";
import { StarRating } from "@/components/ui/StarRating";
import { AutosaveTextarea } from "@/components/ui/AutosaveTextarea";

/** HR's own rating + notes on a candidate (separate from the AI recommendation). */
export function HrAssessmentCard({
  applicant,
  editable,
}: {
  applicant: Applicant;
  editable: boolean;
}) {
  const { saveHrAssessment } = useAppData();
  const [error, setError] = useState<string | null>(null);

  async function setScore(score: number | null) {
    setError(null);
    const result = await saveHrAssessment(applicant.id, { hrScore: score });
    if (!result.success) setError(result.error ?? "Could not save the rating.");
  }

  return (
    <Card>
      <CardHeader
        title="HR assessment"
        subtitle={
          editable
            ? "Your own rating and notes — separate from the AI recommendation"
            : "The assigned HR's own rating and notes"
        }
        action={
          editable &&
          applicant.hrScore !== undefined && (
            <button
              onClick={() => void setScore(null)}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger cursor-pointer"
            >
              <X className="h-3 w-3" /> Clear rating
            </button>
          )
        }
      />
      <CardBody className="space-y-4">
        {editable ? (
          <StarInput value={applicant.hrScore} onChange={(v) => void setScore(v)} />
        ) : applicant.hrScore !== undefined ? (
          <StarRating value={applicant.hrScore} size="lg" />
        ) : (
          <p className="text-sm text-muted">Not rated yet.</p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}

        {editable ? (
          <AutosaveTextarea
            label="HR notes"
            rows={4}
            initial={applicant.hrNotes ?? ""}
            placeholder="Your overall impressions of this candidate…"
            onSave={async (text) => {
              const result = await saveHrAssessment(applicant.id, { hrNotes: text });
              if (!result.success) throw new Error(result.error);
            }}
          />
        ) : (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">HR notes</p>
            <p className="whitespace-pre-line text-sm text-foreground">
              {applicant.hrNotes || <span className="text-muted">No notes yet.</span>}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
