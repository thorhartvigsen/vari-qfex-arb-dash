import { walkNotional } from "@/lib/book";
import { HL_INFO } from "@/lib/entropy";
import type { BookLevel, Side } from "@/lib/types";

export { HL_INFO };

export const OAI_COIN = "io:OAI";
export const OAI_DEX = "io";
export const SB_COIN = "xyz:SOFTBANK";
export const SB_DEX = "xyz";

export const LISTING_MS = Date.parse("2026-09-02T13:00:00.000Z");
/** Listing-relative converge. +8 pp, not 8 bps. */
export const CONVERGE_PP = 8;
export const BAND_PP = 10;
export const UPPER_PP = CONVERGE_PP + BAND_PP; // +18
export const LOWER_PP = CONVERGE_PP - BAND_PP; // -2

export const OAI_DECIMALS = 2;
export const SB_DECIMALS = 3;
export const SIZE_USD = 1_000;

/** First overlapping 5m print from the listing window; used until history loads. */
export const FALLBACK_OAI_BASE = 1151.8;
export const FALLBACK_SB_BASE = 31.235;

export const SPREAD_RANGES = ["1d", "3d", "7d", "all"] as const;
export type OaiSbRange = (typeof SPREAD_RANGES)[number];

export const SPREAD_RANGE_MS: Record<OaiSbRange, number | null> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  all: null,
};

export type OaiSbSignal = "short_oai" | "long_oai" | "flat";

export interface DexLeg {
  dex: "io" | "xyz";
  coin: string;
  size: number;
  side: Side | "flat";
  entryPrice: number | null;
  unrealizedPnl: number | null;
}

export interface OaiSbPositionsPayload {
  fetchedAt: number;
  oai: DexLeg | null;
  softbank: DexLeg | null;
}

export function listingSpreadPp(
  oaiPx: number | null | undefined,
  sbPx: number | null | undefined,
  oaiBase: number,
  sbBase: number,
): number | null {
  if (
    oaiPx == null ||
    sbPx == null ||
    !(oaiPx > 0 && sbPx > 0 && oaiBase > 0 && sbBase > 0)
  ) {
    return null;
  }
  return 100 * (oaiPx / oaiBase - 1) - 100 * (sbPx / sbBase - 1);
}

export function bookMid(
  bid: number | null | undefined,
  ask: number | null | undefined,
): number | null {
  if (bid != null && ask != null && bid > 0 && ask > 0) return (bid + ask) / 2;
  if (bid != null && bid > 0) return bid;
  if (ask != null && ask > 0) return ask;
  return null;
}

export function signalFromSpread(spreadPp: number | null): OaiSbSignal {
  if (spreadPp == null || !Number.isFinite(spreadPp)) return "flat";
  if (spreadPp >= UPPER_PP) return "short_oai";
  if (spreadPp <= LOWER_PP) return "long_oai";
  return "flat";
}

export function hedgeKind(oai: DexLeg | null, sb: DexLeg | null): OaiSbSignal {
  if (!oai || !sb) return "flat";
  if (oai.side === "short" && sb.side === "long") return "short_oai";
  if (oai.side === "long" && sb.side === "short") return "long_oai";
  return "flat";
}

/** Sell OAI bid / buy SoftBank ask — lock a rich listing spread. */
export function shortOaiBookSpread(
  oaiBid: number | null | undefined,
  sbAsk: number | null | undefined,
  oaiBase: number,
  sbBase: number,
): number | null {
  return listingSpreadPp(oaiBid, sbAsk, oaiBase, sbBase);
}

/** Buy OAI ask / sell SoftBank bid — lock a cheap listing spread. */
export function longOaiBookSpread(
  oaiAsk: number | null | undefined,
  sbBid: number | null | undefined,
  oaiBase: number,
  sbBase: number,
): number | null {
  return listingSpreadPp(oaiAsk, sbBid, oaiBase, sbBase);
}

export function sizeWalkSpread(
  oaiLevels: BookLevel[] | undefined,
  sbLevels: BookLevel[] | undefined,
  oaiBase: number,
  sbBase: number,
  usd = SIZE_USD,
): { spreadPp: number | null; filled: boolean } {
  const oai = oaiLevels?.length ? walkNotional(oaiLevels, usd) : null;
  const sb = sbLevels?.length ? walkNotional(sbLevels, usd) : null;
  if (!oai || !sb) return { spreadPp: null, filled: false };
  return {
    spreadPp: listingSpreadPp(oai.avgPrice, sb.avgPrice, oaiBase, sbBase),
    filled: oai.fullyFilled && sb.fullyFilled,
  };
}

export function flattenPnlPp(
  kind: OaiSbSignal,
  entrySpread: number | null,
  exitSpread: number | null,
): number | null {
  if (kind === "flat" || entrySpread == null || exitSpread == null) return null;
  if (kind === "short_oai") return entrySpread - exitSpread;
  return exitSpread - entrySpread;
}

export function adviceFor(opts: {
  live: number | null;
  kind: OaiSbSignal;
  signal: OaiSbSignal;
}): string {
  const { live, kind, signal } = opts;
  const liveLabel = live == null ? "the live spread" : `${live >= 0 ? "+" : ""}${live.toFixed(3)} pp`;

  if (kind === "short_oai") {
    if (live != null && live <= CONVERGE_PP) {
      return `Short OAI / long SoftBank is at or through +${CONVERGE_PP} pp — flatten.`;
    }
    return `Holding short OAI / long SoftBank. Flatten when ${liveLabel} mean-reverts to +${CONVERGE_PP} pp.`;
  }
  if (kind === "long_oai") {
    if (live != null && live >= CONVERGE_PP) {
      return `Long OAI / short SoftBank is at or through +${CONVERGE_PP} pp — flatten.`;
    }
    return `Holding long OAI / short SoftBank. Flatten when ${liveLabel} mean-reverts to +${CONVERGE_PP} pp.`;
  }
  if (signal === "short_oai") {
    return `Spread ≥ +${UPPER_PP} pp. Enter short Entropy OAI / long TradeXYZ SoftBank; target +${CONVERGE_PP} pp.`;
  }
  if (signal === "long_oai") {
    return `Spread ≤ ${LOWER_PP} pp. Enter long Entropy OAI / short TradeXYZ SoftBank; target +${CONVERGE_PP} pp.`;
  }
  return `Inside the ±${BAND_PP} pp bands around +${CONVERGE_PP} pp. No new entry.`;
}
