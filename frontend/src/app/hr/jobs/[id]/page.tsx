import { HrJobDetailClient } from "./HrJobDetailClient";

export default async function HrJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HrJobDetailClient jobId={id} />;
}
