import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  HL_INFO,
  JPY_COIN,
  OAI_COIN,
  QFEX_API,
  SB_SYMBOL,
  bookMid,
  jpyToUsd,
} from "./config.ts";

interface HlLevel {
  px?: string;
  sz?: string;
}

interface HlBook {
  levels?: [HlLevel[], HlLevel[]];
}

interface QfexBook {
  bids?: Array<[string | number, string | number]>;
  asks?: Array<[string | number, string | number]>;
}

async function postInfo<T>(body: unknown, timeoutMs = 15_000): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "oai-softbank-alerts/0.1",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HL ${response.status}: ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
}

function topPx(levels: HlLevel[] | undefined): number | null {
  const px = Number(levels?.[0]?.px);
  return Number.isFinite(px) && px > 0 ? px : null;
}

function topRest(
  levels: Array<[string | number, string | number]> | undefined,
): number | null {
  for (const row of levels ?? []) {
    const px = Number(row[0]);
    const sz = Number(row[1]);
    if (px > 0 && sz > 0) return px;
  }
  return null;
}

export async function fetchHlMid(coin: string): Promise<number> {
  const book = await postInfo<HlBook>({ type: "l2Book", coin });
  const mid = bookMid(topPx(book.levels?.[0]), topPx(book.levels?.[1]));
  if (mid == null) throw new Error(`empty book ${coin}`);
  return mid;
}

export async function fetchQfexMid(symbol: string): Promise<number> {
  const response = await fetch(
    `${QFEX_API}/md/orderbook/${encodeURIComponent(symbol)}`,
    {
      headers: { "User-Agent": "oai-softbank-alerts/0.1" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`QFEX ${response.status}: ${text.slice(0, 160)}`);
  }
  const book = JSON.parse(text) as QfexBook;
  const mid = bookMid(topRest(book.bids), topRest(book.asks));
  if (mid == null) throw new Error(`empty QFEX book ${symbol}`);
  return mid;
}

export interface LiveMids {
  oai: number;
  sbJpy: number;
  usdJpy: number;
  sbUsd: number;
}

export async function fetchLiveMids(): Promise<LiveMids> {
  const [oai, sbJpy, usdJpy] = await Promise.all([
    fetchHlMid(OAI_COIN),
    fetchQfexMid(SB_SYMBOL),
    fetchHlMid(JPY_COIN),
  ]);
  const sbUsd = jpyToUsd(sbJpy, usdJpy);
  if (sbUsd == null) throw new Error("JPY→USD convert failed");
  return { oai, sbJpy, usdJpy, sbUsd };
}

export async function fetchListingBases(): Promise<{
  oaiBase: number;
  sbBase: number;
}> {
  return { oaiBase: FALLBACK_OAI_BASE, sbBase: FALLBACK_SB_BASE };
}
