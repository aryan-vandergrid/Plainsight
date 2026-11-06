import { NextResponse } from "next/server";
import { listLaunches } from "@/lib/server/launches";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listLaunches(), {
      headers: { "cache-control": "public, max-age=10, s-maxage=30, stale-while-revalidate=600", "access-control-allow-origin": "*" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
