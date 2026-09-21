import { ApplicantDetailClient } from "./ApplicantDetailClient";

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string; applicantId: string }>;
}) {
  const { id, applicantId } = await params;
  return <ApplicantDetailClient jobId={id} applicantId={applicantId} />;
}
