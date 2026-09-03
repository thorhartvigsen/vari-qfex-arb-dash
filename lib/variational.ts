import { VARIATIONAL_STATS_URL, type Bbo } from "@/lib/types";

interface VariationalListing {
  ticker?: string;
  name?: string;
  mark_price?: string;
  quotes?: {
    updated_at?: string;
    base?: { bid?: string; ask?: string };
    size_1k?: { bid?: string; ask?: string };
  };
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTs(value: string | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

/** Cloudflare caches /metadata/stats for 30–60s unless the URL is unique. */
export function variationalStatsUrl(): string {
  return `${VARIATIONAL_STATS_URL}?t=${Date.now()}`;
}

export function listingsFromStats(
  json: { listings?: VariationalListing[] },
  tickers: string[],
): Record<string, Bbo> {
  const want = new Set(tickers);
  const out: Record<string, Bbo> = {};

  for (const listing of json.listings ?? []) {
    const ticker = listing.ticker;
    if (!ticker || !want.has(ticker)) continue;
    const quote = listing.quotes?.base ?? listing.quotes?.size_1k;
    out[ticker] = {
      bid: num(quote?.bid),
      ask: num(quote?.ask),
      mark: num(listing.mark_price),
      updatedAt: parseTs(listing.quotes?.updated_at),
    };
  }

  return out;
}

export async function fetchVariationalListings(
  tickers: string[],
  init?: RequestInit,
): Promise<Record<string, Bbo>> {
  const response = await fetch(variationalStatsUrl(), {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Variational stats failed (${response.status})`);
  }
  const json = (await response.json()) as { listings?: VariationalListing[] };
  return listingsFromStats(json, tickers);
}
