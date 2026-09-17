import { NextRequest, NextResponse } from "next/server";
import { fetchOaiSoftbankPnl } from "@/lib/oaiSoftbankPnl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function wantsSnapshot(request: NextRequest): boolean {
  if (request.nextUrl.searchParams.get("snapshot") === "0") return false;
  if (request.nextUrl.searchParams.get("snapshot") === "1") return true;
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const ua = request.headers.get("user-agent") ?? "";
  return /vercel-cron/i.test(ua);
}

export async function GET(request: NextRequest) {
  try {
    const payload = await fetchOaiSoftbankPnl({
      snapshot: wantsSnapshot(request),
    });
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
