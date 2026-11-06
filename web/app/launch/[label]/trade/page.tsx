import { TradePage } from "@/components/launch/TradePage";

export default async function Trade({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params;
  return <TradePage label={decodeURIComponent(label).toLowerCase()} />;
}
