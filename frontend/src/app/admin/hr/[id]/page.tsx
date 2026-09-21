import { HrDetailClient } from "./HrDetailClient";

export default async function HrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HrDetailClient hrId={id} />;
}
