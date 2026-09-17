import { NextResponse } from "next/server";
import { fetchOaiSoftbankFills } from "@/lib/oaiSoftbankFills";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchOaiSoftbankFills();
    return NextResponse.json(
      { ok: true, ...payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAI / SoftBank fills failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
