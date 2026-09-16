import { HL_INFO, LISTING_MS, OAI_COIN, OAI_DEX, SB_COIN, SB_DEX } from "@/lib/oaiSoftbank";

const HOUR_MS = 3_600_000;
const HL_PAGE = 500;

export function hourlyToAnnPct(rate: number): number {
  return rate * 24 * 365 * 100;
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

async function fundingHistory(coin: string, dex: string): Promise<Map<number, number>> {
  const byHour = new Map<number, number>();
  let cursor = LISTING_MS;
  const endMs = Date.now();

  while (cursor <= endMs) {
    const batch = await postInfo<FundingRow[]>({
      type: "fundingHistory",
      coin,
      startTime: cursor,
      dex,
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

async function liveHourly(coin: string, dex: string): Promise<number | null> {
  const payload = await postInfo<[MetaAndCtxs, AssetCtx[]]>({
    type: "metaAndAssetCtxs",
    dex,
  });
  const universe = payload?.[0]?.universe ?? [];
  const ctxs = payload?.[1] ?? [];
  const idx = universe.findIndex((row) => row.name === coin);
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
  const [oaiHist, sbHist, oaiLive, sbLive] = await Promise.all([
    fundingHistory(OAI_COIN, OAI_DEX),
    fundingHistory(SB_COIN, SB_DEX),
    liveHourly(OAI_COIN, OAI_DEX),
    liveHourly(SB_COIN, SB_DEX),
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

  return {
    points,
    live: { oai: leg(oaiLive), sb: leg(sbLive) },
    fetchedAt: Date.now(),
  };
}
