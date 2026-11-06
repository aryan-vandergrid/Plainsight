import { AgentConsole } from "@/components/launch/AgentConsole";

export default async function Agent({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params;
  return <AgentConsole label={decodeURIComponent(label).toLowerCase()} />;
}
