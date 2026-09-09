import { NextRequest, NextResponse } from "next/server";
import {
  ENTROPY_PAIRS,
  SPREAD_RANGES,
  type EntropyId,
  type SpreadRange,
} from "@/lib/entropy";
import { fetchSpreadHistory } from "@/lib/spreadHistory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isRange(value: string | null): value is SpreadRange {
  return SPREAD_RANGES.includes(value as SpreadRange);
}

export async function GET(request: NextRequest) {
  try {
    const market = request.nextUrl.searchParams.get("market") as EntropyId | null;
    const rangeRaw = request.nextUrl.searchParams.get("range") ?? "1d";
    const pair = market ? ENTROPY_PAIRS[market] : undefined;
    if (!pair?.spreadChart) {
      return NextResponse.json(
        { ok: false, error: "Spread history is only available for OAI and ANTH" },
        { status: 400 },
      );
    }
    if (!isRange(rangeRaw)) {
      return NextResponse.json(
        { ok: false, error: "range must be 1d, 3d, 7d, or 14d" },
        { status: 400 },
      );
    }

    const payload = await fetchSpreadHistory(pair, rangeRaw);
    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Spread history failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
