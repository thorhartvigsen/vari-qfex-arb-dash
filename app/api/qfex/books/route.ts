import { NextRequest, NextResponse } from "next/server";
import { fetchQfexBookSnapshots } from "@/lib/qfexBooks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (symbols.length === 0) {
    return NextResponse.json({ ok: false, error: "symbols required" }, { status: 400 });
  }
  try {
    const books = await fetchQfexBookSnapshots(symbols);
    return NextResponse.json(
      { ok: true, books, fetchedAt: Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "QFEX books failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
