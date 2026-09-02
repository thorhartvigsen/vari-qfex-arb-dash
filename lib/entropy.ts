import type { Side } from "@/lib/types";

export const HL_INFO = "https://api.hyperliquid.xyz/info";
export const HL_WS = "wss://api.hyperliquid.xyz/ws";
export const IO_DEX = "io";

export const ENTROPY_IDS = ["nbis", "sndk"] as const;
export type EntropyId = (typeof ENTROPY_IDS)[number];

export interface EntropyPair {
  id: EntropyId;
  label: string;
  title: string;
  qfexSymbol: string;
  hlCoin: string;
  priceDecimals: number;
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
