import { ApplicantStage } from "@/lib/types";
import { Badge } from "./Badge";

const stageMeta: Record<
  ApplicantStage,
  { label: string; tone: "gray" | "green" | "amber" | "red" | "indigo" | "blue" }
> = {
  applied: { label: "Applied", tone: "gray" },
  coding_assessment: { label: "Coding assessment", tone: "amber" },
  assessment_passed: { label: "Interview pending", tone: "blue" },
  interview_scheduled: { label: "Interview scheduled", tone: "indigo" },
  accepted: { label: "Accepted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export function StageBadge({ stage, className }: { stage: ApplicantStage; className?: string }) {
  const meta = stageMeta[stage];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}
