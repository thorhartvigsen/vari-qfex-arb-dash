import { NextResponse } from "next/server";
import { fetchOaiSoftbankPositions } from "@/lib/oaiSoftbankPositions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchOaiSoftbankPositions();
    return NextResponse.json(
      { ok: true, ...payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAI / SoftBank positions failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
