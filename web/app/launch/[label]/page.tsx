import { LaunchStatus } from "@/components/launch/LaunchStatus";

export default async function LaunchPage({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params;
  return <LaunchStatus label={decodeURIComponent(label).toLowerCase()} />;
}
