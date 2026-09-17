import { HL_INFO } from "@/lib/entropy";
import {
  FALLBACK_OAI_BASE,
  FALLBACK_SB_BASE,
  FALLBACK_USDJPY,
  JPY_COIN,
  JPY_DEX,
  LISTING_MS,
  OAI_COIN,
  OAI_DEX,
  SB_SYMBOL,
  jpyToUsd,
  listingSpreadPp,
} from "@/lib/oaiSoftbank";
import { QFEX_API } from "@/lib/types";

const FIVE_MIN = 5 * 60_000;
const HL_PAGE = 500;
const QFEX_CHUNK_MS = 4 * 24 * 60 * 60 * 1000;
const MIN_SB_JPY = 1_000;
const MAX_SB_JPY = 50_000;

export interface OaiSbPoint {
  time: number;
  oai: number;
  sb: number;
  sbUsd: number;
  usdJpy: number;
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

interface QfexCandlesResponse {
  candles?: Array<{
    startedAt?: string;
    close?: string;
  }>;
}

interface HlCandle {
  t?: number;
  c?: string;
}

function parseClose(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "User-Agent": "vari-qfex-arb-dash/oai-softbank",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
}

async function fetchQfex1m(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  let cursor = startMs;

  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + QFEX_CHUNK_MS, endMs);
    const params = new URLSearchParams({
      resolution: "1MIN",
      fromISO: new Date(cursor).toISOString(),
      toISO: new Date(chunkEnd).toISOString(),
    });
    const payload = await fetchJson<QfexCandlesResponse>(
      `${QFEX_API}/candles/${encodeURIComponent(symbol)}?${params}`,
    );
    for (const candle of payload.candles ?? []) {
      const close = parseClose(candle.close);
      const t = candle.startedAt ? Date.parse(candle.startedAt) : NaN;
      if (close === null || !Number.isFinite(t)) continue;
      if (t < startMs || t > endMs) continue;
      if (close < MIN_SB_JPY || close > MAX_SB_JPY) continue;
      out.set(Math.floor(t / 60_000) * 60_000, close);
    }
    cursor = chunkEnd;
  }

  return out;
}

function bucket5m(rows: Map<number, number>): Map<number, number> {
  const bestT = new Map<number, number>();
  const out = new Map<number, number>();
  for (const [t, close] of rows) {
    const key = Math.floor(t / FIVE_MIN) * FIVE_MIN;
    const prevT = bestT.get(key) ?? -1;
    if (t >= prevT) {
      bestT.set(key, t);
      out.set(key, close);
    }
  }
  return out;
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
    const batch = await fetchJson<HlCandle[]>(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

function forwardFill(source: Map<number, number>, times: number[]): Map<number, number> {
  const keys = [...source.keys()].sort((a, b) => a - b);
  const out = new Map<number, number>();
  if (keys.length === 0) return out;
  let i = 0;
  let last = source.get(keys[0]) ?? null;
  for (const time of times) {
    while (i < keys.length && keys[i] <= time) {
      last = source.get(keys[i]) ?? last;
      i += 1;
    }
    if (last != null) out.set(time, last);
  }
  return out;
}

async function fetchHl5m(
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
  const [oai, sb1m, usdJpy] = await Promise.all([
    fetchHl5m(OAI_COIN, OAI_DEX, startMs, endMs),
    fetchQfex1m(SB_SYMBOL, startMs, endMs),
    fetchHl5m(JPY_COIN, JPY_DEX, startMs, endMs),
  ]);
  const sb = bucket5m(sb1m);

  const sbTimes = [...sb.keys()].sort((a, b) => a - b);
  const usdFilled = forwardFill(usdJpy.closes, sbTimes);

  const times = sbTimes.filter((time) => oai.closes.has(time) && usdFilled.has(time));

  const listingKey = Math.floor(LISTING_MS / FIVE_MIN) * FIVE_MIN;
  const oaiBase = oai.closes.get(listingKey) ?? FALLBACK_OAI_BASE;
  const sbBase = FALLBACK_SB_BASE;

  if (times.length === 0) {
    return {
      points: [],
      oaiBase,
      sbBase,
      listingAt: LISTING_MS,
      note:
        [oai.note, usdJpy.note, "No overlapping QFEX SoftBank / OAI / USDJPY bars"]
          .filter(Boolean)
          .join(" · "),
      fetchedAt: Date.now(),
    };
  }

  const points: OaiSbPoint[] = [];
  for (const time of times) {
    const oaiPx = oai.closes.get(time);
    const sbJpy = sb.get(time);
    const fx = usdFilled.get(time) ?? FALLBACK_USDJPY;
    const sbUsd = jpyToUsd(sbJpy, fx);
    if (oaiPx == null || sbJpy == null || sbUsd == null) continue;
    const spreadPp = listingSpreadPp(oaiPx, sbUsd, oaiBase, sbBase);
    if (spreadPp == null) continue;
    points.push({ time, oai: oaiPx, sb: sbJpy, sbUsd, usdJpy: fx, spreadPp });
  }

  const qfexStart = times[0];
  const notes = [
    oai.note,
    usdJpy.note,
    qfexStart > LISTING_MS + 12 * 60 * 60 * 1000
      ? `QFEX SoftBank from ${new Date(qfexStart).toISOString().slice(0, 16)} UTC; JPY÷USDJPY vs 2 Sep listing bases`
      : "SoftBank JPY converted to USD with xyz:JPY",
  ].filter(Boolean);

  return {
    points,
    oaiBase,
    sbBase,
    listingAt: LISTING_MS,
    note: notes.length ? notes.join(" · ") : null,
    fetchedAt: Date.now(),
  };
}
