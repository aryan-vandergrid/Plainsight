import { NextResponse } from "next/server";
import { buildFeed } from "@/lib/server/feed";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ ens: string }> }) {
  const { ens } = await params;
  const label = decodeURIComponent(ens).toLowerCase().replace(/\.plainsight\.eth$/, "");
  try {
    const feed = await buildFeed(label);
    if (!feed) return NextResponse.json({ error: `nothing posted at ${label}.plainsight.eth` }, { status: 404 });
    return NextResponse.json(feed, { headers: { "cache-control": "public, max-age=5", "access-control-allow-origin": "*" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
