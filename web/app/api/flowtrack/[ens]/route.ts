import { NextResponse } from "next/server";
import { flowtrack } from "@/lib/server/flowtrack";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ ens: string }> }) {
  const { ens } = await params;
  const label = decodeURIComponent(ens).toLowerCase().replace(/\.plainsight\.eth$/, "");
  try {
    return NextResponse.json(await flowtrack(label));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
