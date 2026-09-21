import { InterviewRoomClient } from "@/components/interview/InterviewRoomClient";

export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InterviewRoomClient appointmentId={id} />;
}
