import { traderDryRun, traderLive } from "../config.ts";

export async function postTraderHeartbeat(opts?: {
  note?: string | null;
}): Promise<void> {
  const url = process.env.TRADER_STATUS_URL ??
    "https://vari-qfex-arb-dash.vercel.app/api/oai-softbank/trader";
  const secret =
    process.env.TRADER_STATUS_SECRET || process.env.CRON_SECRET || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        live: traderLive(),
        dryRun: traderDryRun() || !traderLive(),
        host:
          process.env.RAILWAY_ENVIRONMENT_NAME || process.env.HOST || "oai-sb",
        note: opts?.note ?? null,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[trader] heartbeat failed", err instanceof Error ? err.message : err);
  }
}
