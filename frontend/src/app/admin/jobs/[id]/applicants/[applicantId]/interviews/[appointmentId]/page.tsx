import { InterviewRecordClient } from "@/components/interview/InterviewRecordClient";

export default async function InterviewRecordPage({
  params,
}: {
  params: Promise<{ id: string; applicantId: string; appointmentId: string }>;
}) {
  const { id, applicantId, appointmentId } = await params;
  return (
    <InterviewRecordClient
      jobId={id}
      applicantId={applicantId}
      appointmentId={appointmentId}
      role="admin"
    />
  );
}
