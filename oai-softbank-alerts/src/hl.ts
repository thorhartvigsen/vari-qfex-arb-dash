import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  HL_INFO,
  OAI_COIN,
  SB_COIN,
  bookMid,
} from "./config.ts";

interface HlLevel {
  px?: string;
  sz?: string;
}

interface HlBook {
  levels?: [HlLevel[], HlLevel[]];
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

export async function fetchMid(coin: string): Promise<number> {
  const book = await postInfo<HlBook>({ type: "l2Book", coin });
  const mid = bookMid(topPx(book.levels?.[0]), topPx(book.levels?.[1]));
  if (mid == null) throw new Error(`empty book ${coin}`);
  return mid;
}

export async function fetchLiveMids(): Promise<{ oai: number; sb: number }> {
  const [oai, sb] = await Promise.all([fetchMid(OAI_COIN), fetchMid(SB_COIN)]);
  return { oai, sb };
}

export async function fetchListingBases(): Promise<{
  oaiBase: number;
  sbBase: number;
}> {
  // Same listing prints the dash uses (first overlapping bar at 2 Sep 13:00 UTC).
  return { oaiBase: FALLBACK_OAI_BASE, sbBase: FALLBACK_SB_BASE };
}
