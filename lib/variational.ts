import { VARIATIONAL_STATS_URL, type Bbo } from "@/lib/types";

interface VariationalListing {
  ticker?: string;
  name?: string;
  mark_price?: string;
  quotes?: {
    base?: { bid?: string; ask?: string };
    size_1k?: { bid?: string; ask?: string };
  };
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchVariationalListings(
  tickers: string[],
): Promise<Record<string, Bbo>> {
  const response = await fetch(VARIATIONAL_STATS_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Variational stats failed (${response.status})`);
  }
  const json = (await response.json()) as { listings?: VariationalListing[] };
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
      updatedAt: Date.now(),
    };
  }

  return out;
}
