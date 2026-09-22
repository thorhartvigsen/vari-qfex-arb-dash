import {
  LIQ_TOPUP_TARGET_PCT,
  LIQ_TOPUP_TRIGGER_PCT,
  MIN_ISOLATED_TOPUP_USD,
  OAI_ISOLATED_LEV,
} from "../config.ts";

/** Remaining room to OAI liq as a % of mark. Null if flat / unknown. */
export function distToLiqPct(
  size: number,
  mark: number,
  liq: number | null,
): number | null {
  if (liq == null || !(mark > 0) || !Number.isFinite(size) || size === 0) {
    return null;
  }
  if (!(liq > 0)) return null;
  if (size > 0) {
    if (liq >= mark) return 0;
    return ((mark - liq) / mark) * 100;
  }
  if (liq <= mark) return 0;
  return ((liq - mark) / mark) * 100;
}

/**
 * Isolated liq moves ~$1 / contract when you add $1 of margin.
 * Same closed form for long and short: ΔM = notional × (target − dist) / 100.
 */
export function marginToReachDistUsd(opts: {
  size: number;
  mark: number;
  distPct: number;
  targetPct?: number;
}): number {
  const target = opts.targetPct ?? LIQ_TOPUP_TARGET_PCT;
  const gap = target - opts.distPct;
  if (!(gap > 0) || !(opts.mark > 0) || opts.size === 0) return 0;
  const notional = Math.abs(opts.size) * opts.mark;
  return notional * (gap / 100) * 1.08;
}

export function isolatedTopUpUsd(opts: {
  size: number;
  mark: number;
  liq: number | null;
  freeUsd: number;
}): { distPct: number | null; addUsd: number } {
  const distPct = distToLiqPct(opts.size, opts.mark, opts.liq);
  if (distPct == null || distPct > LIQ_TOPUP_TRIGGER_PCT) {
    return { distPct, addUsd: 0 };
  }
  const need = marginToReachDistUsd({
    size: opts.size,
    mark: opts.mark,
    distPct,
  });
  const addUsd = Math.max(0, Math.min(need, Math.max(0, opts.freeUsd)));
  if (addUsd < MIN_ISOLATED_TOPUP_USD) return { distPct, addUsd: 0 };
  return { distPct, addUsd };
}

export function clipInitialMarginUsd(clipUsd: number): number {
  return Math.abs(clipUsd) / OAI_ISOLATED_LEV;
}

/** HL pulls extra isolated IM from withdrawable on a size increase. */
export function canFundIsolatedClip(freeUsd: number, clipUsd: number): boolean {
  return freeUsd + 1e-6 >= clipInitialMarginUsd(clipUsd);
}

export function isolatedFreeDepleted(freeUsd: number): boolean {
  return freeUsd + 1e-6 < MIN_ISOLATED_TOPUP_USD;
}
