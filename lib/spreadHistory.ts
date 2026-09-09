import {
  HL_INFO,
  IO_DEX,
  SPREAD_RANGE_MS,
  type EntropyPair,
  type SpreadRange,
} from "@/lib/entropy";

const MINUTE_MS = 60_000;
const QFEX_CHUNK_MS = 4 * 24 * 60 * 60 * 1000;
const HL_PAGE = 500;

const HL_BACKFILL: Array<{ interval: string; ms: number }> = [
  { interval: "5m", ms: 5 * MINUTE_MS },
  { interval: "15m", ms: 15 * MINUTE_MS },
  { interval: "1h", ms: 60 * MINUTE_MS },
];

export interface SpreadPoint {
  time: number;
  spreadBps: number;
  qfex: number;
  entropy: number;
}

export interface SpreadHistoryPayload {
  market: string;
  range: SpreadRange;
  points: SpreadPoint[];
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

function minuteKey(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

function parseClose(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "User-Agent": "vari-qfex-arb-dash/spread",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status}): ${text.slice(0, 180)}`);
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
      fromISO: iso(cursor),
      toISO: iso(chunkEnd),
    });
    const payload = await fetchJson<QfexCandlesResponse>(
      `https://api.qfex.com/candles/${encodeURIComponent(symbol)}?${params}`,
    );
    for (const candle of payload.candles ?? []) {
      const close = parseClose(candle.close);
      const t = candle.startedAt ? Date.parse(candle.startedAt) : NaN;
      if (close === null || !Number.isFinite(t)) continue;
      const key = minuteKey(t);
      if (key < startMs || key > endMs) continue;
      out.set(key, close);
    }
    cursor = chunkEnd;
  }

  return out;
}

async function fetchHlCandles(
  coin: string,
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
          dex: IO_DEX,
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

function expandToMinutes(
  candles: Array<{ t: number; close: number }>,
  intervalMs: number,
  fromMs: number,
  toMs: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const candle of candles) {
    const start = Math.max(minuteKey(candle.t), minuteKey(fromMs));
    const end = Math.min(candle.t + intervalMs, toMs);
    for (let t = start; t < end; t += MINUTE_MS) {
      out.set(t, candle.close);
    }
  }
  return out;
}

async function fetchEntropy1m(
  coin: string,
  startMs: number,
  endMs: number,
): Promise<{ closes: Map<number, number>; note: string | null }> {
  const native = await fetchHlCandles(coin, startMs, endMs, "1m", MINUTE_MS);
  const closes = new Map<number, number>();
  for (const row of native) {
    closes.set(minuteKey(row.t), row.close);
  }

  if (native.length === 0) {
    return { closes, note: "No Entropy 1-minute candles in this window" };
  }

  const first1m = native[0].t;
  if (first1m <= startMs + 2 * MINUTE_MS) {
    return { closes, note: null };
  }

  let used: string | null = null;
  for (const { interval, ms } of HL_BACKFILL) {
    const coarser = await fetchHlCandles(coin, startMs, first1m - 1, interval, ms);
    if (coarser.length === 0) continue;
    const expanded = expandToMinutes(coarser, ms, startMs, first1m);
    for (const [t, close] of expanded) {
      if (!closes.has(t)) closes.set(t, close);
    }
    used = interval;
    break;
  }

  if (!used) {
    return {
      closes,
      note: `Entropy 1m from ${iso(first1m)}; no coarser candles to backfill`,
    };
  }

  return {
    closes,
    note: `Entropy 1m from ${new Date(first1m).toISOString().slice(0, 16)} UTC; earlier minutes use ${used} closes`,
  };
}

export async function fetchSpreadHistory(
  pair: EntropyPair,
  range: SpreadRange,
): Promise<SpreadHistoryPayload> {
  const endMs = Date.now();
  const startMs = endMs - SPREAD_RANGE_MS[range];

  const [qfex, entropy] = await Promise.all([
    fetchQfex1m(pair.qfexSymbol, startMs, endMs),
    fetchEntropy1m(pair.hlCoin, startMs, endMs),
  ]);

  const points: SpreadPoint[] = [];
  for (const [time, qfexPx] of [...qfex.entries()].sort((a, b) => a[0] - b[0])) {
    const entropyPx = entropy.closes.get(time);
    if (entropyPx === undefined || entropyPx <= 0) continue;
    points.push({
      time,
      qfex: qfexPx,
      entropy: entropyPx,
      spreadBps: ((qfexPx - entropyPx) / entropyPx) * 10_000,
    });
  }

  return {
    market: pair.id,
    range,
    points,
    note: entropy.note,
    fetchedAt: Date.now(),
  };
}
