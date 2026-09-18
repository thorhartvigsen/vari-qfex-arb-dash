import { LEV_TIERS, listingSpreadPp, MID_PP } from "../config.ts";
import type { BookLevel } from "../hl.ts";
import { distFromMid, type TradeDir } from "./signal.ts";

/** Top-of-book prices we would actually hit to enter `dir`. */
export function entryTouchPx(opts: {
  dir: TradeDir;
  oaiBids: BookLevel[];
  oaiAsks: BookLevel[];
  sbBids: BookLevel[];
  sbAsks: BookLevel[];
  usdJpy: number;
}): { oaiPx: number; sbJpy: number; sbUsd: number } | null {
  if (opts.dir === "flat" || !(opts.usdJpy > 0)) return null;
  const oaiPx =
    opts.dir === "short_oai" ? opts.oaiBids[0]?.price : opts.oaiAsks[0]?.price;
  const sbJpy =
    opts.dir === "short_oai" ? opts.sbAsks[0]?.price : opts.sbBids[0]?.price;
  if (!(oaiPx != null && oaiPx > 0 && sbJpy != null && sbJpy > 0)) return null;
  const sbUsd = sbJpy / opts.usdJpy;
  if (!(sbUsd > 0)) return null;
  return { oaiPx, sbJpy, sbUsd };
}

/**
 * Listing spread at the bid/ask we would lift/hit for this entry side.
 * Short OAI → OAI bid / SoftBank ask. Long OAI → OAI ask / SoftBank bid.
 */
export function entryTouchSpreadPp(opts: {
  dir: TradeDir;
  oaiBids: BookLevel[];
  oaiAsks: BookLevel[];
  sbBids: BookLevel[];
  sbAsks: BookLevel[];
  usdJpy: number;
  oaiBase: number;
  sbBase: number;
}): number | null {
  const touch = entryTouchPx(opts);
  if (!touch) return null;
  return listingSpreadPp(touch.oaiPx, touch.sbUsd, opts.oaiBase, opts.sbBase);
}

export function touchSupportsEntry(dir: TradeDir, touchPp: number | null): boolean {
  if (touchPp == null || dir === "flat") return false;
  if (dir === "short_oai") return touchPp > MID_PP;
  return touchPp < MID_PP;
}

/**
 * USD both legs can take while the listing-relative fill still supports
 * `minDistPp` from the 8% mid. Used to cap scale-in. Flatten/TP skip this.
 */
export function availablePairedUsd(opts: {
  dir: TradeDir;
  oaiBids: BookLevel[];
  oaiAsks: BookLevel[];
  sbBids: BookLevel[];
  sbAsks: BookLevel[];
  usdJpy: number;
  oaiBase: number;
  sbBase: number;
  minDistPp: number;
  maxUsd: number;
}): number {
  const { dir, usdJpy, oaiBase, sbBase, minDistPp, maxUsd } = opts;
  if (dir === "flat" || !(maxUsd > 0) || !(usdJpy > 0)) return 0;

  const oaiLevels = dir === "short_oai" ? opts.oaiBids : opts.oaiAsks;
  const sbLevels = dir === "short_oai" ? opts.sbAsks : opts.sbBids;

  let i = 0;
  let j = 0;
  let remOai = oaiLevels[0]?.size ?? 0;
  let remSb = sbLevels[j]?.size ?? 0;
  let filledUsd = 0;

  while (i < oaiLevels.length && j < sbLevels.length && filledUsd < maxUsd - 1e-6) {
    if (remOai <= 0) {
      i += 1;
      remOai = oaiLevels[i]?.size ?? 0;
      continue;
    }
    if (remSb <= 0) {
      j += 1;
      remSb = sbLevels[j]?.size ?? 0;
      continue;
    }
    const oaiPx = oaiLevels[i]!.price;
    const sbJpy = sbLevels[j]!.price;
    const sbUsd = sbJpy / usdJpy;
    if (!(oaiPx > 0) || !(sbUsd > 0)) break;

    const spread = listingSpreadPp(oaiPx, sbUsd, oaiBase, sbBase);
    if (spread == null) break;
    if (minDistPp > 0 && distFromMid(spread) < minDistPp) break;
    if (dir === "short_oai" && !(spread > MID_PP)) break;
    if (dir === "long_oai" && !(spread < MID_PP)) break;

    const takeUsd = Math.min(remOai * oaiPx, remSb * sbJpy, maxUsd - filledUsd);
    if (!(takeUsd > 0)) break;
    filledUsd += takeUsd;
    remOai -= takeUsd / oaiPx;
    remSb -= takeUsd / sbJpy;
  }

  return filledUsd;
}

export function entryMinDistPp(targetLev: number): number {
  let dist = 0;
  for (const tier of LEV_TIERS) {
    if (targetLev + 1e-9 >= tier.lev) dist = tier.distPp;
  }
  return dist;
}
