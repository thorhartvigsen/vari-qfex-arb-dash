import type { Side } from "@/lib/types";

export const HL_INFO = "https://api.hyperliquid.xyz/info";
export const HL_WS = "wss://api.hyperliquid.xyz/ws";
export const IO_DEX = "io";

export const ENTROPY_IDS = ["nbis", "sndk", "oai", "anth"] as const;
export type EntropyId = (typeof ENTROPY_IDS)[number];

export const SPREAD_RANGES = ["1d", "3d", "7d", "14d"] as const;
export type SpreadRange = (typeof SPREAD_RANGES)[number];

export const SPREAD_RANGE_MS: Record<SpreadRange, number> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};

export interface EntropyPair {
  id: EntropyId;
  label: string;
  title: string;
  qfexSymbol: string;
  hlCoin: string;
  priceDecimals: number;
  /** 1-minute QFEX vs Entropy close spread chart. */
  spreadChart?: boolean;
}

export const ENTROPY_PAIRS: Record<EntropyId, EntropyPair> = {
  nbis: {
    id: "nbis",
    label: "NBIS",
    title: "NBIS — QFEX vs Hyperliquid io",
    qfexSymbol: "NBIS-USD",
    hlCoin: "io:NBIS",
    priceDecimals: 2,
  },
  sndk: {
    id: "sndk",
    label: "SNDK",
    title: "SNDK — QFEX vs Hyperliquid io",
    qfexSymbol: "SNDK-USD",
    hlCoin: "io:SNDK",
    priceDecimals: 2,
  },
  oai: {
    id: "oai",
    label: "OAI",
    title: "OAI — QFEX vs Hyperliquid io",
    qfexSymbol: "OPENAI-USD",
    hlCoin: "io:OAI",
    priceDecimals: 2,
    spreadChart: true,
  },
  anth: {
    id: "anth",
    label: "ANTH",
    title: "ANTH — QFEX vs Hyperliquid io",
    qfexSymbol: "ANTHROPIC-USD",
    hlCoin: "io:ANTH",
    priceDecimals: 2,
    spreadChart: true,
  },
};

export function resolveEntropy(id: string | null | undefined): EntropyPair {
  if (id && id in ENTROPY_PAIRS) return ENTROPY_PAIRS[id as EntropyId];
  return ENTROPY_PAIRS.sndk;
}

export interface VenueLeg {
  venue: "qfex" | "hyperliquid";
  symbol: string;
  size: number;
  side: Side | "flat";
  entryPrice: number | null;
  unrealizedPnl: number | null;
}

export interface EntropyPositionsPayload {
  fetchedAt: number;
  market: EntropyId;
  qfex: VenueLeg | null;
  hyperliquid: VenueLeg | null;
}
