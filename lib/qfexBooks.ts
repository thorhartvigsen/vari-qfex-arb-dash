import { normalizeLevels, sortAsks, sortBids, topOfBook } from "@/lib/book";
import { QFEX_API, type Bbo } from "@/lib/types";

const UA = { "User-Agent": "vari-qfex-arb-dash/qfex-books" };

interface QfexBookBody {
  bids?: Array<[string | number, string | number]>;
  asks?: Array<[string | number, string | number]>;
}

interface QfexContractsBody {
  data?: Array<{
    ticker_id?: string;
    last_price?: string;
    index_price?: string;
  }>;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", headers: UA });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`QFEX ${url} (${response.status}): ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
}

function bookFromLevels(raw: QfexBookBody, mark: number | null): Bbo {
  const bids = sortBids(normalizeLevels(raw.bids ?? []));
  const asks = sortAsks(normalizeLevels(raw.asks ?? []));
  const bid = topOfBook(bids);
  const ask = topOfBook(asks);
  return {
    bid,
    ask,
    bids,
    asks,
    mark: mark ?? (bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask),
    updatedAt: Date.now(),
  };
}

export async function fetchQfexBookSnapshots(
  symbols: string[],
): Promise<Record<string, Bbo>> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const [books, contracts] = await Promise.all([
    Promise.all(
      unique.map(async (symbol) => {
        try {
          const body = await fetchJson<QfexBookBody>(
            `${QFEX_API}/md/orderbook/${encodeURIComponent(symbol)}`,
          );
          return [symbol, body] as const;
        } catch {
          return [symbol, { bids: [], asks: [] }] as const;
        }
      }),
    ),
    Promise.all(
      unique.map(async (symbol) => {
        try {
          const body = await fetchJson<QfexContractsBody>(
            `${QFEX_API}/md/contracts?symbol=${encodeURIComponent(symbol)}`,
          );
          const row =
            (body.data ?? []).find((item) => item.ticker_id === symbol) ??
            body.data?.[0];
          return [
            symbol,
            num(row?.last_price) ?? num(row?.index_price),
          ] as const;
        } catch {
          return [symbol, null] as const;
        }
      }),
    ),
  ]);

  const marks = new Map(contracts);
  const out: Record<string, Bbo> = {};
  for (const [symbol, body] of books) {
    out[symbol] = bookFromLevels(body, marks.get(symbol) ?? null);
  }
  return out;
}
