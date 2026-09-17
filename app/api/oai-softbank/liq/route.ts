import { NextResponse } from "next/server";
import { fetchOaiSoftbankLiq } from "@/lib/oaiSoftbankLiq";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const payload = await fetchOaiSoftbankLiq();
    return NextResponse.json(
      { ok: true, ...payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAI / SoftBank liq failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
