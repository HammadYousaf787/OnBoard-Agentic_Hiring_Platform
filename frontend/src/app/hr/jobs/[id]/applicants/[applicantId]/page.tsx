import { HrApplicantDetailClient } from "./HrApplicantDetailClient";

export default async function HrApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string; applicantId: string }>;
}) {
  const { id, applicantId } = await params;
  return <HrApplicantDetailClient jobId={id} applicantId={applicantId} />;
}
