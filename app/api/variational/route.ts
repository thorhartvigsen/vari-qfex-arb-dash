import { NextResponse } from "next/server";
import { PAIRS } from "@/lib/types";
import { fetchVariationalListings } from "@/lib/variational";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tickers = Object.values(PAIRS).map((pair) => pair.varTicker);
    const listings = await fetchVariationalListings(tickers);
    return NextResponse.json(
      { ok: true, fetchedAt: Date.now(), listings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Variational fetch failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
