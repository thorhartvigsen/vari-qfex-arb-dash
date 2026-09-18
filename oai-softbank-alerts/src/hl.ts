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

export interface BookLevel {
  price: number;
  size: number;
}

function parseHlLevels(levels: HlLevel[] | undefined): BookLevel[] {
  const out: BookLevel[] = [];
  for (const row of levels ?? []) {
    const price = Number(row.px);
    const size = Number(row.sz);
    if (price > 0 && size > 0) out.push({ price, size });
  }
  return out;
}

function parseQfexLevels(
  levels: Array<[string | number, string | number]> | undefined,
): BookLevel[] {
  const out: BookLevel[] = [];
  for (const row of levels ?? []) {
    const price = Number(row[0]);
    const size = Number(row[1]);
    if (price > 0 && size > 0) out.push({ price, size });
  }
  return out;
}

export interface LiveMids {
  oai: number;
  sbJpy: number;
  usdJpy: number;
  sbUsd: number;
  oaiBids: BookLevel[];
  oaiAsks: BookLevel[];
  sbBids: BookLevel[];
  sbAsks: BookLevel[];
}

export async function fetchLiveMids(): Promise<LiveMids> {
  const [oaiBook, sbBook, usdJpy] = await Promise.all([
    postInfo<HlBook>({ type: "l2Book", coin: OAI_COIN }),
    fetch(`${QFEX_API}/md/orderbook/${encodeURIComponent(SB_SYMBOL)}`, {
      headers: { "User-Agent": "oai-softbank-alerts/0.1" },
      signal: AbortSignal.timeout(15_000),
    }).then(async (response) => {
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`QFEX ${response.status}: ${text.slice(0, 160)}`);
      }
      return JSON.parse(text) as QfexBook;
    }),
    fetchHlMid(JPY_COIN),
  ]);

  const oaiBids = parseHlLevels(oaiBook.levels?.[0]);
  const oaiAsks = parseHlLevels(oaiBook.levels?.[1]);
  const sbBids = parseQfexLevels(sbBook.bids);
  const sbAsks = parseQfexLevels(sbBook.asks);
  const oai = bookMid(oaiBids[0]?.price ?? null, oaiAsks[0]?.price ?? null);
  const sbJpy = bookMid(sbBids[0]?.price ?? null, sbAsks[0]?.price ?? null);
  if (oai == null) throw new Error("empty book io:OAI");
  if (sbJpy == null) throw new Error("empty QFEX book SOFTBANK-JPY");
  const sbUsd = jpyToUsd(sbJpy, usdJpy);
  if (sbUsd == null) throw new Error("JPY→USD convert failed");
  return {
    oai,
    sbJpy,
    usdJpy,
    sbUsd,
    oaiBids,
    oaiAsks,
    sbBids,
    sbAsks,
  };
}

export async function fetchListingBases(): Promise<{
  oaiBase: number;
  sbBase: number;
}> {
  return { oaiBase: FALLBACK_OAI_BASE, sbBase: FALLBACK_SB_BASE };
}
