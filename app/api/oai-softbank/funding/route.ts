import { NextResponse } from "next/server";
import { fetchOaiSoftbankFunding } from "@/lib/oaiSoftbankFunding";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const payload = await fetchOaiSoftbankFunding();
    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Funding history failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
