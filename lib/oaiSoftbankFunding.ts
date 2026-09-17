import { HL_INFO, LISTING_MS, OAI_COIN, OAI_DEX, SB_SYMBOL } from "@/lib/oaiSoftbank";
import { QFEX_API } from "@/lib/types";

const HOUR_MS = 3_600_000;
const HL_PAGE = 500;
const ANN_MULT = 24 * 365;

export function hourlyToAnnPct(rate: number): number {
  return rate * ANN_MULT * 100;
}

export interface FundingPoint {
  time: number;
  oai: number | null;
  sb: number | null;
  oaiAnn: number | null;
  sbAnn: number | null;
}

export interface FundingLegLive {
  hourly: number | null;
  annPct: number | null;
}

export interface OaiSbFundingPayload {
  points: FundingPoint[];
  live: { oai: FundingLegLive; sb: FundingLegLive };
  fetchedAt: number;
}

interface FundingRow {
  coin?: string;
  fundingRate?: string | number;
  time?: number;
}

interface MetaAndCtxs {
  universe?: Array<{ name?: string }>;
}

interface AssetCtx {
  funding?: string | number;
}

interface QfexFundingResponse {
  data?: Array<{
    windowStart?: string;
    rate?: number | string;
    intervalMinutes?: number;
  }>;
}

async function postInfo<T>(body: unknown): Promise<T> {
  const response = await fetch(HL_INFO, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "vari-qfex-arb-dash/oai-softbank-funding",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HL funding failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
}

async function oaiFundingHistory(): Promise<Map<number, number>> {
  const byHour = new Map<number, number>();
  let cursor = LISTING_MS;
  const endMs = Date.now();

  while (cursor <= endMs) {
    const batch = await postInfo<FundingRow[]>({
      type: "fundingHistory",
      coin: OAI_COIN,
      startTime: cursor,
      dex: OAI_DEX,
    });
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const row of batch) {
      const time = Number(row.time);
      const rate = Number(row.fundingRate);
      if (!Number.isFinite(time) || !Number.isFinite(rate)) continue;
      if (time < LISTING_MS || time > endMs) continue;
      byHour.set(Math.floor(time / HOUR_MS) * HOUR_MS, rate);
    }

    const lastTime = Math.max(...batch.map((row) => Number(row.time) || 0));
    if (!Number.isFinite(lastTime) || lastTime <= cursor || batch.length < HL_PAGE) break;
    cursor = lastTime + 1;
  }

  return byHour;
}

async function qfexFundingHistory(symbol: string): Promise<Map<number, number>> {
  const params = new URLSearchParams({
    intervalMinutes: "60",
    fromISO: new Date(LISTING_MS).toISOString(),
    toISO: new Date().toISOString(),
  });
  const response = await fetch(
    `${QFEX_API}/funding/${encodeURIComponent(symbol)}?${params}`,
    { cache: "no-store", headers: { "User-Agent": "vari-qfex-arb-dash/oai-softbank-funding" } },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`QFEX funding failed (${response.status}): ${text.slice(0, 160)}`);
  }
  const json = JSON.parse(text) as QfexFundingResponse;
  const byHour = new Map<number, number>();
  for (const row of json.data ?? []) {
    const time = Date.parse(row.windowStart ?? "");
    const rate = Number(row.rate);
    if (!Number.isFinite(time) || !Number.isFinite(rate)) continue;
    byHour.set(Math.floor(time / HOUR_MS) * HOUR_MS, rate);
  }
  return byHour;
}

async function oaiLiveHourly(): Promise<number | null> {
  const payload = await postInfo<[MetaAndCtxs, AssetCtx[]]>({
    type: "metaAndAssetCtxs",
    dex: OAI_DEX,
  });
  const universe = payload?.[0]?.universe ?? [];
  const ctxs = payload?.[1] ?? [];
  const idx = universe.findIndex((row) => row.name === OAI_COIN);
  if (idx < 0) return null;
  const rate = Number(ctxs[idx]?.funding);
  return Number.isFinite(rate) ? rate : null;
}

function leg(hourly: number | null): FundingLegLive {
  return {
    hourly,
    annPct: hourly == null ? null : hourlyToAnnPct(hourly),
  };
}

export async function fetchOaiSoftbankFunding(): Promise<OaiSbFundingPayload> {
  const [oaiHist, sbHist, oaiLive] = await Promise.all([
    oaiFundingHistory(),
    qfexFundingHistory(SB_SYMBOL),
    oaiLiveHourly(),
  ]);

  const times = [...new Set([...oaiHist.keys(), ...sbHist.keys()])].sort((a, b) => a - b);
  const points: FundingPoint[] = times.map((time) => {
    const oai = oaiHist.get(time) ?? null;
    const sb = sbHist.get(time) ?? null;
    return {
      time,
      oai,
      sb,
      oaiAnn: oai == null ? null : hourlyToAnnPct(oai),
      sbAnn: sb == null ? null : hourlyToAnnPct(sb),
    };
  });

  const lastSbTime = [...sbHist.keys()].sort((a, b) => a - b).at(-1);
  const lastSb = lastSbTime != null ? (sbHist.get(lastSbTime) ?? null) : null;

  return {
    points,
    live: { oai: leg(oaiLive), sb: leg(lastSb) },
    fetchedAt: Date.now(),
  };
}
