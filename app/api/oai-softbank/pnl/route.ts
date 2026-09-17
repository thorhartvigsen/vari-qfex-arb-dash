import { NextResponse } from "next/server";
import { fetchOaiSoftbankPnl } from "@/lib/oaiSoftbankPnl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const payload = await fetchOaiSoftbankPnl();
    return NextResponse.json(
      { ok: true, ...payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAI / SoftBank PnL failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
