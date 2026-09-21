import {
  EXIT_TIERS,
  LEV_HOLD_EPS,
  LEV_TIERS,
  MAX_LEV,
  MID_PP,
  minClipUsd,
} from "../config.ts";

export type TradeDir = "short_oai" | "long_oai" | "flat";
export type TradeAction = "hold" | "enter" | "scale" | "take_profit" | "flatten";

export function distFromMid(spreadPp: number): number {
  return Math.abs(spreadPp - MID_PP);
}

/** Max leverage we may scale into at this distance from 8%. */
export function entryLeverage(spreadPp: number): number {
  const dist = distFromMid(spreadPp);
  let lev = 0;
  for (const tier of LEV_TIERS) {
    if (dist >= tier.distPp) lev = tier.lev;
  }
  return Math.min(lev, MAX_LEV);
}

/** Max leverage we may keep when taking profit (hysteresis vs entry). */
export function exitLeverage(spreadPp: number): number {
  const dist = distFromMid(spreadPp);
  if (dist <= 0) return 0;
  let lev = MAX_LEV;
  for (const tier of EXIT_TIERS) {
    if (dist <= tier.distPp) {
      lev = tier.lev;
      break;
    }
  }
  return Math.min(lev, MAX_LEV);
}

export function sideOfMid(spreadPp: number): TradeDir {
  if (spreadPp > MID_PP) return "short_oai";
  if (spreadPp < MID_PP) return "long_oai";
  return "flat";
}

/** Covering `posDir` hits the opposite book. Short → buy OAI ask / sell SB bid. */
export function oppositeDir(dir: TradeDir): TradeDir {
  if (dir === "short_oai") return "long_oai";
  if (dir === "long_oai") return "short_oai";
  return "flat";
}

export function positionDir(oaiUsd: number, sbUsd: number): TradeDir {
  const clip = minClipUsd();
  const hasOai = Math.abs(oaiUsd) >= clip;
  const hasSb = Math.abs(sbUsd) >= clip;
  if (!hasOai && !hasSb) return "flat";
  const oaiShort = oaiUsd <= 0;
  const sbLong = sbUsd >= 0;
  const oaiLong = oaiUsd >= 0;
  const sbShort = sbUsd <= 0;
  if (oaiShort && sbLong) return "short_oai";
  if (oaiLong && sbShort) return "long_oai";
  return "flat";
}

export function currentLeverage(
  oaiUsd: number,
  sbUsd: number,
  baseUsd: number,
): number {
  if (!(baseUsd > 0)) return 0;
  return Math.max(Math.abs(oaiUsd), Math.abs(sbUsd)) / baseUsd;
}

export interface BookPlan {
  dir: TradeDir;
  targetLev: number;
  entryLev: number;
  exitLev: number;
  currentLev: number;
  action: TradeAction;
}

/**
 * Entry uses executable bid/ask. TP / flatten use the unwind bid/ask
 * (cover a short at OAI ask / SoftBank bid).
 */
export function planBook(
  midSpreadPp: number,
  oaiUsd: number,
  sbUsd: number,
  baseUsd: number,
  entrySpreadPp: number | null = null,
  unwindSpreadPp: number | null = null,
): BookPlan {
  const addDir = entrySpreadPp == null ? "flat" : sideOfMid(entrySpreadPp);
  const unwindDir =
    unwindSpreadPp == null ? "flat" : sideOfMid(unwindSpreadPp);
  const entryLev =
    addDir !== "flat" &&
    entrySpreadPp != null &&
    ((addDir === "short_oai" && entrySpreadPp > MID_PP) ||
      (addDir === "long_oai" && entrySpreadPp < MID_PP))
      ? entryLeverage(entrySpreadPp)
      : 0;
  const exitLev =
    unwindSpreadPp == null ? MAX_LEV : exitLeverage(unwindSpreadPp);
  const posDir = positionDir(oaiUsd, sbUsd);
  const currentLev = currentLeverage(oaiUsd, sbUsd, baseUsd);
  const eps = LEV_HOLD_EPS;
  const clip = minClipUsd();
  const hasPos = Math.abs(oaiUsd) >= clip || Math.abs(sbUsd) >= clip;
  const hedged =
    (oaiUsd <= 0 && sbUsd >= 0) || (oaiUsd >= 0 && sbUsd <= 0);
  if (hasPos && !hedged) {
    return {
      dir: "flat",
      targetLev: 0,
      entryLev,
      exitLev,
      currentLev,
      action: "flatten",
    };
  }

  if (posDir === "flat") {
    if (entryLev <= 0 || addDir === "flat") {
      return {
        dir: "flat",
        targetLev: 0,
        entryLev,
        exitLev,
        currentLev,
        action: "hold",
      };
    }
    return {
      dir: addDir,
      targetLev: entryLev,
      entryLev,
      exitLev,
      currentLev,
      action: "enter",
    };
  }

  if (
    unwindSpreadPp != null &&
    unwindDir !== posDir
  ) {
    return {
      dir: posDir,
      targetLev: 0,
      entryLev,
      exitLev,
      currentLev,
      action: "flatten",
    };
  }

  if (addDir === posDir && currentLev + eps < entryLev) {
    return {
      dir: posDir,
      targetLev: entryLev,
      entryLev,
      exitLev,
      currentLev,
      action: currentLev < eps ? "enter" : "scale",
    };
  }
  if (currentLev - eps > exitLev) {
    return {
      dir: posDir,
      targetLev: exitLev,
      entryLev,
      exitLev,
      currentLev,
      action: exitLev <= 0 ? "flatten" : "take_profit",
    };
  }
  return {
    dir: posDir,
    targetLev: currentLev,
    entryLev,
    exitLev,
    currentLev,
    action: "hold",
  };
}

/** @deprecated use entryLeverage */
export function targetLeverage(spreadPp: number): number {
  return entryLeverage(spreadPp);
}

export function targetDirection(spreadPp: number): TradeDir {
  if (entryLeverage(spreadPp) <= 0) return "flat";
  return sideOfMid(spreadPp);
}

export function directionLabel(dir: TradeDir): string {
  if (dir === "short_oai") return "SHORT OAI / LONG SoftBank";
  if (dir === "long_oai") return "LONG OAI / SHORT SoftBank";
  return "FLATTEN";
}

export function roundSize(size: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.floor(size * f + 1e-12) / f;
}

export function signedNotional(size: number, px: number): number {
  if (!Number.isFinite(size) || !Number.isFinite(px) || !(px > 0)) return 0;
  return size * px;
}

/** Desired signed USD notional per leg (OAI USD, SoftBank QFEX JPY-as-USDC). */
export function targetSignedUsd(
  dir: TradeDir,
  targetUsd: number,
): { oaiUsd: number; sbUsd: number } {
  if (dir === "flat" || !(targetUsd > 0)) return { oaiUsd: 0, sbUsd: 0 };
  if (dir === "short_oai") return { oaiUsd: -targetUsd, sbUsd: targetUsd };
  return { oaiUsd: targetUsd, sbUsd: -targetUsd };
}

export function reduceOnly(currentSize: number, targetSize: number): boolean {
  if (Math.abs(currentSize) < 1e-12) return false;
  if (Math.abs(targetSize) < 1e-12) return true;
  return (
    Math.sign(currentSize) === Math.sign(targetSize) &&
    Math.abs(targetSize) < Math.abs(currentSize) - 1e-12
  );
}

export function clipUsd(deltaUsd: number): number {
  return Math.abs(deltaUsd) >= minClipUsd() ? deltaUsd : 0;
}

/** e.g. "10% for 0.3× enter" — the ladder rung that fired, not the live print. */
export function formatActivatedRung(
  action: TradeAction,
  dir: TradeDir,
  targetLev: number,
): string {
  const verb =
    action === "take_profit"
      ? "take profit"
      : action === "flatten"
        ? "flatten"
        : action === "scale"
          ? "scale"
          : "enter";
  if (action === "flatten" || !(targetLev > 0) || dir === "flat") {
    return `8% for flatten`;
  }
  const tiers = action === "take_profit" ? EXIT_TIERS : LEV_TIERS;
  let dist = 0;
  for (const tier of tiers) {
    if (Math.abs(tier.lev - targetLev) < 1e-9) dist = tier.distPp;
  }
  const print = dir === "long_oai" ? MID_PP - dist : MID_PP + dist;
  const label = Number.isInteger(print) ? `${print}` : `${print}`;
  return `${label}% for ${targetLev}× ${verb}`;
}

export function formatLevBands(): string {
  return LEV_TIERS.map((t) => {
    const lo = MID_PP - t.distPp;
    const hi = MID_PP + t.distPp;
    return `${t.lev}× @ ${lo}% / ${hi}%`;
  }).join(" · ");
}

export function formatExitBands(): string {
  return EXIT_TIERS.map((t) => {
    const lo = MID_PP - t.distPp;
    const hi = MID_PP + t.distPp;
    if (t.distPp === 0) return `0× @ 8%`;
    return `${t.lev}× @ ${lo}% / ${hi}%`;
  }).join(" · ");
}
