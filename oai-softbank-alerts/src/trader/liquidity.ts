import { LEV_TIERS, listingSpreadPp } from "../config.ts";
import type { BookLevel } from "../hl.ts";
import { distFromMid, type TradeDir } from "./signal.ts";

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
    if (dir === "short_oai" && !(spread > 8)) break;
    if (dir === "long_oai" && !(spread < 8)) break;

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
