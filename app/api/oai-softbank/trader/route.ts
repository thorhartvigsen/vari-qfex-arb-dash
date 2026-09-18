import { NextResponse } from "next/server";
import {
  readOaiSbTraderStatus,
  writeOaiSbTraderStatus,
} from "@/lib/oaiSoftbankTraderStatus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret =
    process.env.TRADER_STATUS_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET() {
  const status = await readOaiSbTraderStatus();
  return NextResponse.json(
    { ok: true, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    live?: boolean;
    dryRun?: boolean;
    host?: string;
    note?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const status = await writeOaiSbTraderStatus({
    live: Boolean(body.live),
    dryRun: body.dryRun !== false,
    host: body.host,
    note: body.note ?? null,
  });
  return NextResponse.json({ ok: true, ...status });
}
