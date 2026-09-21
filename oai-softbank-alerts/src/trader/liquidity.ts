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

/**
 * VWAP listing spread after independently walking `usd` on each entry-side
 * book (same as the dashboard $1,000 row).
 */
export function entryWalkSpreadPp(opts: {
  dir: TradeDir;
  oaiBids: BookLevel[];
  oaiAsks: BookLevel[];
  sbBids: BookLevel[];
  sbAsks: BookLevel[];
  usdJpy: number;
  oaiBase: number;
  sbBase: number;
  usd: number;
}): { spreadPp: number | null; filled: boolean } {
  if (opts.dir === "flat" || !(opts.usd > 0) || !(opts.usdJpy > 0)) {
    return { spreadPp: null, filled: false };
  }
  const oaiLevels = opts.dir === "short_oai" ? opts.oaiBids : opts.oaiAsks;
  const sbLevels = opts.dir === "short_oai" ? opts.sbAsks : opts.sbBids;
  const oai = walkUsd(oaiLevels, opts.usd);
  const sb = walkUsd(sbLevels, opts.usd);
  if (!oai || !sb) return { spreadPp: null, filled: false };
  const sbUsd = sb.avgPrice / opts.usdJpy;
  return {
    spreadPp: listingSpreadPp(oai.avgPrice, sbUsd, opts.oaiBase, opts.sbBase),
    filled: oai.fullyFilled && sb.fullyFilled,
  };
}

function walkUsd(
  levels: BookLevel[],
  usd: number,
): { avgPrice: number; fullyFilled: boolean } | null {
  if (!levels.length) return null;
  let remaining = usd;
  let qty = 0;
  let spent = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const px = level.price;
    const notional = px * level.size;
    if (!(px > 0) || !(notional > 0)) continue;
    const take = Math.min(remaining, notional);
    qty += take / px;
    spent += take;
    remaining -= take;
  }
  if (qty <= 0 || spent <= 0) return null;
  return { avgPrice: spent / qty, fullyFilled: remaining <= usd * 1e-9 };
}

export function touchSupportsEntry(dir: TradeDir, touchPp: number | null): boolean {
  if (touchPp == null || dir === "flat") return false;
  if (dir === "short_oai") return touchPp > MID_PP;
  return touchPp < MID_PP;
}

/** Worse unwind print — don't TP until even this has come in toward 8%. */
export function conservativeUnwindSpread(
  posDir: TradeDir,
  tobPp: number | null,
  walkPp: number | null,
  walkFilled: boolean,
): number | null {
  if (tobPp == null || posDir === "flat") return null;
  if (!walkFilled || walkPp == null) return tobPp;
  if (posDir === "short_oai") return Math.max(tobPp, walkPp);
  return Math.min(tobPp, walkPp);
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
