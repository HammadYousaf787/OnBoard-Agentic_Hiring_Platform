import { ReactNode } from "react";
import { Sparkles, Trophy } from "lucide-react";
import { Applicant } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StarRating } from "@/components/ui/StarRating";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const CATEGORY_LABELS: Record<string, string> = {
  communication: "Communication",
  jdOverlap: "Job description overlap",
  github: "GitHub activity & relevance",
  linkedin: "LinkedIn activity & relevance",
};

/** Shows the AI Job Review: scores plus the model's written reasoning for each. Recommendation only. */
export function AiJobReviewCard({
  applicant,
  rank,
  action,
}: {
  applicant: Applicant;
  rank?: { position: number; total: number } | null;
  action?: ReactNode;
}) {
  const review = applicant.aiReviewDetails;

  return (
    <Card>
      <CardHeader
        title="AI Job Review"
        subtitle={
          review
            ? `Powered by ${review.model} — a recommendation only`
            : "Real evaluation using GitHub, LinkedIn, and CV/cover letter vs. the job description"
        }
        action={action}
      />
      <CardBody>
        {!review ? (
          <EmptyState
            icon={Sparkles}
            title="Not reviewed yet"
            description="Run the AI Job Review to get a real, explained evaluation of this candidate."
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-soft px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Overall</p>
                <StarRating value={review.overall.score} size="lg" />
              </div>
              {rank && (
                <Badge tone="indigo">
                  <Trophy className="h-3.5 w-3.5" />
                  AI suggests #{rank.position} of {rank.total}
                </Badge>
              )}
            </div>
            <p className="-mt-3 text-sm text-muted">{review.overall.reasoning}</p>

            <div className="space-y-4 border-t border-border pt-4">
              {(
                [
                  { key: "communication", cat: review.communication, available: true },
                  { key: "jdOverlap", cat: review.jdOverlap, available: true },
                  { key: "github", cat: review.github, available: review.githubAvailable },
                  { key: "linkedin", cat: review.linkedin, available: review.linkedinAvailable },
                ] as const
              ).map(({ key, cat, available }) => (
                <div key={key}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {CATEGORY_LABELS[key]}
                      {!available && (
                        <Badge tone="gray" className="text-[10px]">
                          data unavailable
                        </Badge>
                      )}
                    </span>
                    <StarRating value={cat.score} size="sm" />
                  </div>
                  <p className="mt-1 text-xs text-muted">{cat.reasoning}</p>
                </div>
              ))}
            </div>

            <p className="border-t border-border pt-3 text-xs text-muted">
              Reviewed{" "}
              {new Date(review.generatedAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
