import { NextRequest, NextResponse } from "next/server";
import { fetchEntropyPositions } from "@/lib/entropyPositions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const market = request.nextUrl.searchParams.get("market");
    const payload = await fetchEntropyPositions(market);
    return NextResponse.json(
      { ok: true, ...payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Entropy positions failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
