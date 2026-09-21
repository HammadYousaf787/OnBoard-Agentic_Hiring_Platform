import { ApplyClient } from "./ApplyClient";

export default async function ApplyPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <ApplyClient jobId={jobId} />;
}
