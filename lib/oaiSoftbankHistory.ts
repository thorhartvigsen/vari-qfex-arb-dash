import { HL_INFO } from "@/lib/entropy";
import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  LISTING_MS,
  OAI_COIN,
  OAI_DEX,
  SB_COIN,
  SB_DEX,
  listingSpreadPp,
} from "@/lib/oaiSoftbank";

const FIVE_MIN = 5 * 60_000;
const HL_PAGE = 500;

export interface OaiSbPoint {
  time: number;
  oai: number;
  sb: number;
  spreadPp: number;
}

export interface OaiSbSpreadPayload {
  points: OaiSbPoint[];
  oaiBase: number;
  sbBase: number;
  listingAt: number;
  note: string | null;
  fetchedAt: number;
}

interface HlCandle {
  t?: number;
  c?: string;
}

function parseClose(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchHlCandles(
  coin: string,
  dex: string,
  startMs: number,
  endMs: number,
  interval: string,
  stepMs: number,
): Promise<Array<{ t: number; close: number }>> {
  const byT = new Map<number, number>();
  let cursor = startMs;

  while (cursor < endMs) {
    const response = await fetch(HL_INFO, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "vari-qfex-arb-dash/oai-softbank",
      },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin,
          interval,
          startTime: cursor,
          endTime: endMs,
          dex,
        },
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${coin} candles failed (${response.status}): ${text.slice(0, 160)}`);
    }
    const batch = JSON.parse(text) as HlCandle[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const row of batch) {
      const t = Number(row.t);
      const close = parseClose(row.c);
      if (!Number.isFinite(t) || close === null) continue;
      if (t < startMs || t > endMs) continue;
      byT.set(t, close);
    }

    const lastT = Math.max(...batch.map((row) => Number(row.t) || 0));
    if (!Number.isFinite(lastT) || lastT <= cursor) break;
    if (batch.length < HL_PAGE || lastT >= endMs - stepMs) break;
    cursor = lastT + 1;
  }

  return [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, close]) => ({ t, close }));
}

function toMap(rows: Array<{ t: number; close: number }>): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of rows) {
    const key = Math.floor(row.t / FIVE_MIN) * FIVE_MIN;
    out.set(key, row.close);
  }
  return out;
}

async function fetch5m(
  coin: string,
  dex: string,
  startMs: number,
  endMs: number,
): Promise<{ closes: Map<number, number>; note: string | null }> {
  const native = await fetchHlCandles(coin, dex, startMs, endMs, "5m", FIVE_MIN);
  const closes = toMap(native);
  if (native.length === 0) {
    return { closes, note: `No 5m candles for ${coin}` };
  }
  const first = native[0].t;
  if (first <= startMs + 2 * FIVE_MIN) {
    return { closes, note: null };
  }
  for (const [interval, ms] of [
    ["15m", 15 * 60_000],
    ["1h", 60 * 60_000],
  ] as const) {
    const coarser = await fetchHlCandles(coin, dex, startMs, first - 1, interval, ms);
    if (coarser.length === 0) continue;
    for (const row of coarser) {
      const key = Math.floor(row.t / FIVE_MIN) * FIVE_MIN;
      if (key >= startMs && key < first && !closes.has(key)) {
        closes.set(key, row.close);
      }
    }
    return {
      closes,
      note: `${coin} 5m from ${new Date(first).toISOString().slice(0, 16)} UTC; earlier uses ${interval}`,
    };
  }
  return {
    closes,
    note: `${coin} 5m from ${new Date(first).toISOString().slice(0, 16)} UTC`,
  };
}

export async function fetchOaiSoftbankSpread(): Promise<OaiSbSpreadPayload> {
  const endMs = Date.now();
  const startMs = LISTING_MS;
  const [oai, sb] = await Promise.all([
    fetch5m(OAI_COIN, OAI_DEX, startMs, endMs),
    fetch5m(SB_COIN, SB_DEX, startMs, endMs),
  ]);

  const times = [...oai.closes.keys()]
    .filter((time) => sb.closes.has(time))
    .sort((a, b) => a - b);

  if (times.length === 0) {
    return {
      points: [],
      oaiBase: FALLBACK_OAI_BASE,
      sbBase: FALLBACK_SB_BASE,
      listingAt: LISTING_MS,
      note: [oai.note, sb.note].filter(Boolean).join(" · ") || "No overlapping 5m bars",
      fetchedAt: Date.now(),
    };
  }

  const oaiBase = oai.closes.get(times[0]) ?? FALLBACK_OAI_BASE;
  const sbBase = sb.closes.get(times[0]) ?? FALLBACK_SB_BASE;
  const points: OaiSbPoint[] = [];
  for (const time of times) {
    const oaiPx = oai.closes.get(time);
    const sbPx = sb.closes.get(time);
    if (oaiPx == null || sbPx == null) continue;
    const spreadPp = listingSpreadPp(oaiPx, sbPx, oaiBase, sbBase);
    if (spreadPp == null) continue;
    points.push({ time, oai: oaiPx, sb: sbPx, spreadPp });
  }

  const notes = [oai.note, sb.note].filter(Boolean);
  return {
    points,
    oaiBase,
    sbBase,
    listingAt: times[0],
    note: notes.length ? notes.join(" · ") : null,
    fetchedAt: Date.now(),
  };
}
