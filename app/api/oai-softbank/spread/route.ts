import { NextResponse } from "next/server";
import { fetchOaiSoftbankSpread } from "@/lib/oaiSoftbankHistory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const payload = await fetchOaiSoftbankSpread();
    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Spread history failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
